#!/usr/bin/env node
/**
 * 미지급금(통장 연동 Payment) 정리 — 지출관리 연동 + 은행 적요 우선 정책
 *
 * 1) 동일 bank_transaction_id 에 Payment 2건+ → 지급예정(expense_accrual_id) 있는 행 유지, orphan 삭제
 * 2) 남은 통장 연동 Payment 적요 → 은행 memo 기준으로 `통장 지급: …` 통일
 *
 *   node scripts/apply-payable-bank-link-cleanup.mjs --dry-run
 *   node scripts/apply-payable-bank-link-cleanup.mjs --execute
 *
 * 옵션: --start=2025-01-01 --end=2026-12-31  (미지정 시 전체)
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
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required (.env.local)')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const execute = process.argv.includes('--execute')
const dryRun = !execute

function parseArgs() {
  let start = null
  let end = null
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--start=')) start = arg.slice(8).slice(0, 10)
    if (arg.startsWith('--end=')) end = arg.slice(6).slice(0, 10)
  }
  return { start, end }
}

function buildBankMemoLine(bankMemo) {
  const m = String(bankMemo || '').trim()
  return m ? `통장 지급: ${m}`.slice(0, 240) : '통장 지급'
}

function pickKeeper(rows) {
  const withAccrual = rows.filter((r) => Number(r.expense_accrual_id || 0) > 0)
  const pool = withAccrual.length ? withAccrual : rows
  return pool.reduce((best, r) => (Number(r.id) > Number(best.id) ? r : best))
}

async function fetchAllPayments(start, end) {
  const pageSize = 1000
  const out = []
  let from = 0
  while (true) {
    let q = supabase
      .from('payable_transactions')
      .select('id,vendor_code,amount,trans_date,memo,bank_transaction_id,expense_accrual_id,ref_type')
      .eq('ref_type', 'Payment')
      .not('bank_transaction_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (start) q = q.gte('trans_date', start)
    if (end) q = q.lte('trans_date', end)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
    if (from >= 200_000) break
  }
  return out
}

async function fetchBanksByIds(ids) {
  const unique = [...new Set(ids.map((id) => Number(id)).filter((id) => id > 0))]
  const map = new Map()
  const chunk = 200
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk)
    const { data, error } = await supabase.from('bank_transactions').select('id,memo').in('id', slice)
    if (error) throw error
    for (const row of data || []) map.set(Number(row.id), row)
  }
  return map
}

async function main() {
  const { start, end } = parseArgs()
  console.log(
    `\n=== 미지급 통장 Payment 정리 ${execute ? '(EXECUTE)' : '(DRY-RUN)'} ===` +
      `\n기간: ${start || '전체'} ~ ${end || '전체'}\n`
  )

  const payments = await fetchAllPayments(start, end)
  console.log(`통장 연동 Payment ${payments.length}건 로드\n`)

  const byBank = new Map()
  for (const p of payments) {
    const bankId = Number(p.bank_transaction_id || 0)
    if (!bankId) continue
    if (!byBank.has(bankId)) byBank.set(bankId, [])
    byBank.get(bankId).push(p)
  }

  const deleteIds = []
  const dupGroups = []
  for (const [bankId, rows] of byBank) {
    if (rows.length < 2) continue
    const keeper = pickKeeper(rows)
    const victims = rows.filter((r) => Number(r.id) !== Number(keeper.id))
    for (const v of victims) deleteIds.push(Number(v.id))
    dupGroups.push({
      bankId,
      keepId: Number(keeper.id),
      keepAccrual: Number(keeper.expense_accrual_id || 0) || null,
      deleteIds: victims.map((v) => Number(v.id)),
      vendor: keeper.vendor_code,
      date: String(keeper.trans_date || '').slice(0, 10),
      amount: Math.abs(Number(keeper.amount) || 0),
      keepMemo: String(keeper.memo || '').slice(0, 80),
    })
  }

  console.log(`【1】통장당 중복 Payment 그룹: ${dupGroups.length}건 → 삭제 예정 ${deleteIds.length}행`)
  for (const g of dupGroups.slice(0, 30)) {
    console.log(
      `  bank#${g.bankId} ${g.date} ${g.vendor} ฿${g.amount.toLocaleString()} keep#${g.keepId}` +
        `${g.keepAccrual ? `(accrual ${g.keepAccrual})` : '(no accrual)'} del [${g.deleteIds.join(',')}]`
    )
  }
  if (dupGroups.length > 30) console.log(`  … 외 ${dupGroups.length - 30}그룹`)

  // survivors for memo sync = all payments minus deletes
  const deleteSet = new Set(deleteIds)
  const survivors = payments.filter((p) => !deleteSet.has(Number(p.id)))
  const bankMap = await fetchBanksByIds(survivors.map((p) => p.bank_transaction_id))

  const memoUpdates = []
  for (const p of survivors) {
    const bankId = Number(p.bank_transaction_id || 0)
    const bank = bankMap.get(bankId)
    if (!bank) continue
    const bankText = String(bank.memo || '').trim()
    if (!bankText) continue
    const desired = buildBankMemoLine(bankText)
    const current = String(p.memo || '').trim()
    if (current === desired) continue
    // 은행 적요 우선 대상: 지출관리 기본문구·빈 적요만 (인명·거래처 단축 적요는 유지)
    const shouldRewrite =
      /지출\s*지급/.test(current) ||
      current === '통장 지급' ||
      current === '패티 지급' ||
      /^통장\s*지급:\s*$/.test(current)
    if (!shouldRewrite) continue
    memoUpdates.push({
      id: Number(p.id),
      bankId,
      from: current.slice(0, 100),
      to: desired.slice(0, 100),
    })
  }

  console.log(`【2】은행 적요로 memo 갱신 예정(지출 지급 등): ${memoUpdates.length}건`)
  for (const u of memoUpdates.slice(0, 25)) {
    console.log(`  pay#${u.id} bank#${u.bankId}\n    ← ${u.from}\n    → ${u.to}`)
  }
  if (memoUpdates.length > 25) console.log(`  … 외 ${memoUpdates.length - 25}건`)

  // 【3】같은 거래처·일자·금액인데 bank_id 다르거나 orphan 이 따로 있는 이중 후보
  // (동일 bank 중복은 【1】에서 처리. 여기선 한쪽만 accrual / 한쪽만 orphan 패턴)
  const byVendorDayAmt = new Map()
  for (const p of survivors) {
    const vc = String(p.vendor_code || '').trim()
    const day = String(p.trans_date || '').slice(0, 10)
    const amt = Math.round(Math.abs(Number(p.amount) || 0) * 100)
    if (!vc || !day || !amt) continue
    const key = `${vc}|${day}|${amt}`
    if (!byVendorDayAmt.has(key)) byVendorDayAmt.set(key, [])
    byVendorDayAmt.get(key).push(p)
  }
  const softDupDeleteIds = []
  const softDupGroups = []
  for (const [, bucket] of byVendorDayAmt) {
    if (bucket.length < 2) continue
    const withAccrual = bucket.filter((r) => Number(r.expense_accrual_id || 0) > 0)
    const orphans = bucket.filter((r) => !Number(r.expense_accrual_id || 0))
    if (!withAccrual.length || !orphans.length) continue
    // accrual 있는 쪽 유지, orphan 삭제 (은행 적요형 orphan vs 지출지급 accrual 이중)
    for (const o of orphans) softDupDeleteIds.push(Number(o.id))
    softDupGroups.push({
      vendor: bucket[0].vendor_code,
      date: String(bucket[0].trans_date || '').slice(0, 10),
      amount: Math.abs(Number(bucket[0].amount) || 0),
      keep: withAccrual.map((r) => Number(r.id)),
      del: orphans.map((r) => Number(r.id)),
      keepMemo: String(withAccrual[0].memo || '').slice(0, 60),
      delMemo: String(orphans[0].memo || '').slice(0, 60),
    })
  }
  console.log(`\n【3】거래처·일자·금액 동일 + (연동 vs orphan) 이중: ${softDupGroups.length}그룹 → orphan 삭제 ${softDupDeleteIds.length}건`)
  for (const g of softDupGroups.slice(0, 40)) {
    console.log(
      `  ${g.date} ${g.vendor} ฿${g.amount.toLocaleString()} keep[${g.keep.join(',')}] del[${g.del.join(',')}]`
    )
    console.log(`    keep: ${g.keepMemo}`)
    console.log(`    del:  ${g.delMemo}`)
  }
  if (softDupGroups.length > 40) console.log(`  … 외 ${softDupGroups.length - 40}그룹`)

  const allDeleteIds = [...new Set([...deleteIds, ...softDupDeleteIds])]

  if (dryRun) {
    console.log('\n실행하려면: node scripts/apply-payable-bank-link-cleanup.mjs --execute\n')
    return
  }

  if (allDeleteIds.length) {
    const chunk = 100
    let deleted = 0
    for (let i = 0; i < allDeleteIds.length; i += chunk) {
      const slice = allDeleteIds.slice(i, i + chunk)
      const { error, count } = await supabase.from('payable_transactions').delete({ count: 'exact' }).in('id', slice)
      if (error) throw error
      deleted += count ?? slice.length
    }
    console.log(`\n삭제 완료: ${deleted}건`)
  } else {
    console.log('\n삭제 대상 없음')
  }

  // memo updates: skip rows we deleted
  const deletedSet2 = new Set(allDeleteIds)
  const memoAfterDelete = memoUpdates.filter((u) => !deletedSet2.has(u.id))
  // After soft-dup: for remaining accrual rows that still say 지출 지급, rewrite from their bank
  let updated = 0
  for (const u of memoAfterDelete) {
    const bank = bankMap.get(u.bankId)
    const memo = buildBankMemoLine(bank?.memo)
    const { error } = await supabase.from('payable_transactions').update({ memo }).eq('id', u.id)
    if (error) throw error
    updated++
  }
  // Also rewrite accrual rows kept in soft-dup that still have 지출 지급
  for (const g of softDupGroups) {
    for (const keepId of g.keep) {
      if (memoAfterDelete.some((u) => u.id === keepId)) continue
      const row = survivors.find((p) => Number(p.id) === keepId)
      if (!row) continue
      const bank = bankMap.get(Number(row.bank_transaction_id))
      if (!bank || !String(bank.memo || '').trim()) continue
      if (!/지출\s*지급/.test(String(row.memo || ''))) continue
      const memo = buildBankMemoLine(bank.memo)
      const { error } = await supabase.from('payable_transactions').update({ memo }).eq('id', keepId)
      if (error) throw error
      updated++
    }
  }
  console.log(`적요 갱신 완료: ${updated}건`)
  console.log('\n완료.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
