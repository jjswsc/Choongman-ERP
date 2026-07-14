#!/usr/bin/env node
/**
 * 미지급 이중 정리 — CSV 실통장 vs 지출관리 내부 생성 통장(source:expense_internal)
 *
 * 같은 계좌·거래처·일자에
 *   A) CSV 실적요 출금 + orphan Payment
 *   B) note 에 source:expense_internal + accrual Payment
 * 가 함께 있으면 → accrual Payment 를 A 통장으로 옮기고, orphan Payment·내부 통장 B 삭제
 *
 *   node scripts/apply-payable-expense-internal-dup-cleanup.mjs --dry-run
 *   node scripts/apply-payable-expense-internal-dup-cleanup.mjs --execute
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = val
  }
}

loadEnvFile(resolve(root, '.env.local'))
loadEnvFile(resolve(root, '.env'))

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const execute = process.argv.includes('--execute')

const INTERNAL_MARKER = 'source:expense_internal'
const AMOUNT_TOLERANCE = 100.01 // ฿ — 세금·반올림 차이 허용

function isInternalBank(note) {
  return String(note || '').includes(INTERNAL_MARKER)
}

function looksLikeExpenseMemo(memo) {
  return /지출\s*지급/.test(String(memo || ''))
}

async function fetchPages(table, select, apply) {
  const pageSize = 1000
  const out = []
  let from = 0
  while (true) {
    let q = supabase.from(table).select(select).order('id').range(from, from + pageSize - 1)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
    if (from >= 100_000) break
  }
  return out
}

function buildMemo(bankMemo) {
  const m = String(bankMemo || '').trim()
  return m && !looksLikeExpenseMemo(m) ? `통장 지급: ${m}`.slice(0, 240) : null
}

async function main() {
  console.log(`\n=== 내부통장(expense_internal) ↔ CSV 이중 정리 ${execute ? '(EXECUTE)' : '(DRY-RUN)'} ===\n`)

  const internalBanks = await fetchPages(
    'bank_transactions',
    'id,account_id,amount,trans_date,memo,note,category,vendor_code',
    (q) => q.ilike('note', `%${INTERNAL_MARKER}%`).eq('trans_type', 'withdraw')
  )
  console.log(`내부 생성 출금: ${internalBanks.length}건`)

  const payments = await fetchPages(
    'payable_transactions',
    'id,vendor_code,amount,trans_date,memo,bank_transaction_id,expense_accrual_id,ref_type',
    (q) => q.eq('ref_type', 'Payment').not('bank_transaction_id', 'is', null)
  )
  const payByBank = new Map()
  for (const p of payments) {
    const bid = Number(p.bank_transaction_id)
    if (!payByBank.has(bid)) payByBank.set(bid, [])
    payByBank.get(bid).push(p)
  }

  // real banks: same account/vendor/day candidates
  const vendorDays = new Set()
  for (const b of internalBanks) {
    const vc = String(b.vendor_code || '').trim()
    const day = String(b.trans_date || '').slice(0, 10)
    if (vc && day) vendorDays.add(`${b.account_id}|${vc}|${day}`)
  }

  const realCandidates = []
  for (const key of vendorDays) {
    const [accountId, vendor, day] = key.split('|')
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('id,account_id,amount,trans_date,memo,note,category,vendor_code')
      .eq('account_id', Number(accountId))
      .eq('vendor_code', vendor)
      .eq('trans_date', day)
      .eq('trans_type', 'withdraw')
    if (error) throw error
    for (const row of data || []) {
      if (!isInternalBank(row.note)) realCandidates.push(row)
    }
  }

  const plans = []
  for (const internal of internalBanks) {
    const day = String(internal.trans_date || '').slice(0, 10)
    const vc = String(internal.vendor_code || '').trim()
    const iAmt = Math.abs(Number(internal.amount) || 0)
    const iPays = payByBank.get(Number(internal.id)) || []
    const accrualPay = iPays.find((p) => Number(p.expense_accrual_id || 0) > 0) || iPays[0]
    if (!accrualPay) continue

    const rivals = realCandidates.filter((r) => {
      if (Number(r.account_id) !== Number(internal.account_id)) return false
      if (String(r.vendor_code || '').trim() !== vc) return false
      if (String(r.trans_date || '').slice(0, 10) !== day) return false
      if (Number(r.id) === Number(internal.id)) return false
      const rAmt = Math.abs(Number(r.amount) || 0)
      return Math.abs(rAmt - iAmt) <= AMOUNT_TOLERANCE
    })
    if (!rivals.length) continue

    // prefer rival with orphan payment or real bank memo
    let best = null
    let bestOrphan = null
    for (const r of rivals) {
      const pays = payByBank.get(Number(r.id)) || []
      const orphan = pays.find((p) => !Number(p.expense_accrual_id || 0))
      const score =
        (orphan ? 10 : 0) +
        (!looksLikeExpenseMemo(r.memo) ? 5 : 0) +
        (String(r.memo || '').trim() ? 1 : 0)
      if (!best || score > best.score) {
        best = { bank: r, score }
        bestOrphan = orphan || null
      }
    }
    if (!best) continue

    const real = best.bank
    const memo = buildMemo(real.memo) || String(accrualPay.memo || '').replace(/지출\s*지급/, '통장연동')
    plans.push({
      vendor: vc,
      date: day,
      internalBankId: Number(internal.id),
      realBankId: Number(real.id),
      accrualPayId: Number(accrualPay.id),
      orphanPayId: bestOrphan ? Number(bestOrphan.id) : null,
      accrualId: Number(accrualPay.expense_accrual_id || 0) || null,
      internalAmt: iAmt,
      realAmt: Math.abs(Number(real.amount) || 0),
      realMemo: String(real.memo || '').slice(0, 80),
      newPayMemo: memo.slice(0, 80),
    })
  }

  console.log(`정리 계획: ${plans.length}건\n`)
  for (const p of plans) {
    console.log(
      `${p.date} ${p.vendor} | real bank#${p.realBankId} ฿${p.realAmt} ← internal bank#${p.internalBankId} ฿${p.internalAmt}`
    )
    console.log(`  keep pay#${p.accrualPayId} (accrual ${p.accrualId}) → bank ${p.realBankId}`)
    if (p.orphanPayId) console.log(`  delete orphan pay#${p.orphanPayId}`)
    console.log(`  delete internal bank#${p.internalBankId}`)
    console.log(`  memo: ${p.newPayMemo}`)
    console.log(`  bank memo: ${p.realMemo}\n`)
  }

  if (!execute) {
    console.log('실행: node scripts/apply-payable-expense-internal-dup-cleanup.mjs --execute\n')
    return
  }

  let done = 0
  for (const p of plans) {
    const { error: upErr } = await supabase
      .from('payable_transactions')
      .update({
        bank_transaction_id: p.realBankId,
        amount: -Math.abs(p.realAmt),
        memo: `통장 지급: ${String(p.realMemo || '').trim() || '지급'}`.slice(0, 240),
        trans_date: p.date,
      })
      .eq('id', p.accrualPayId)
    if (upErr) throw upErr

    if (p.orphanPayId) {
      const { error } = await supabase.from('payable_transactions').delete().eq('id', p.orphanPayId)
      if (error) throw error
    }

    // 내부 통장 잔액 분개도 있을 수 있어 note 마킹만으로는 부족 → 삭제 시도
    // 다른 payable 이 달리지 않았는지 재확인
    const { data: still } = await supabase
      .from('payable_transactions')
      .select('id')
      .eq('bank_transaction_id', p.internalBankId)
      .limit(5)
    if (still?.length) {
      console.warn(`skip delete bank#${p.internalBankId}: still linked pays`, still.map((x) => x.id))
    } else {
      // journal cleanup best-effort
      await supabase
        .from('journal_entries')
        .delete()
        .eq('source_type', 'bank_transaction')
        .eq('source_id', p.internalBankId)
      const { error: bErr } = await supabase.from('bank_transactions').delete().eq('id', p.internalBankId)
      if (bErr) {
        console.warn(`bank delete #${p.internalBankId}:`, bErr.message)
      }
    }
    done++
  }
  console.log(`완료: ${done}건\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
