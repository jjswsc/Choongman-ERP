#!/usr/bin/env node
/**
 * Future Park 이중 수금 정리 + Future Park/Silom 통장 미수 연결
 *   node scripts/repair-futurepark-silom-receivable.mjs --dry-run
 *   node scripts/repair-futurepark-silom-receivable.mjs --execute
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

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
)

const execute = process.argv.includes('--execute')
const remainingOnly = process.argv.includes('--remaining-only')

/** Future Park 수동 수금확인(이중) — 삭제 */
const FUTURE_PARK_MANUAL_RECV_IDS = [1117, 1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126]

/**
 * 통장 #7613 = #7554 와 동일 입금(฿101,741.45) 중복 CSV — 통합 수금 행만 제거
 * recv #1067 (bank 7613)
 */
const DUPLICATE_CONSOLIDATED_RECV_IDS = [1067]

/**
 * 확정 미수 연결 (합계 = 통장 입금액)
 * - Silom #7611: 6/18 인보이스 9건 = ฿202,802.45
 * - Future Park #7680: IV202606XX-594 (#730) = ฿15,155.48
 */
const EXPLICIT_BANK_LINKS = [
  {
    bankTransactionId: 7611,
    accrualIds: [644, 659, 662, 727, 758, 812, 813, 827, 831],
    note: 'Silom 2026-06-18 입금',
  },
  {
    bankTransactionId: 7680,
    accrualIds: [730],
    note: 'Future Park IV202606XX-594',
  },
]

/** bank #7554 — 6월 인보이스 8건 합계 = ฿101,741.45 */
const REMAINING_BANK_LINKS = [
  {
    bankTransactionId: 7554,
    accrualIds: [823, 490, 536, 511, 680, 587, 1168, 972],
    note: '6/10 입금 — 6월 미수 인보이스 배분',
  },
]

/** 통장 입금액 < 인보이스 잔액 (은행 수수료 등) — 부분 수금 */
const PARTIAL_BANK_LINKS = [
  {
    bankTransactionId: 7682,
    accrualId: 751,
    amountAbs: 2777.13,
    note: 'IV.202606XX-604 ฿2,782 대비 ฿4.87 차이(수수료)',
  },
]

function round2(n) {
  return Math.round(n * 100) / 100
}

function storesMatch(a, b) {
  const x = String(a || '')
    .trim()
    .toLowerCase()
    .replace(/^cm\s+/, '')
  const y = String(b || '')
    .trim()
    .toLowerCase()
    .replace(/^cm\s+/, '')
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

function computeOpen(accrualAmount, offsets) {
  const gross = Math.max(0, Number(accrualAmount) || 0)
  const paid = (offsets || []).reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
  return Math.max(0, round2(gross - paid))
}

async function linkBankToAccruals(bankTransactionId, accrualIds) {
  const { data: bankRows, error: e1 } = await supabase
    .from('bank_transactions')
    .select('id,trans_type,category,amount,trans_date,memo,store_name,store')
    .eq('id', bankTransactionId)
    .limit(1)
  if (e1) throw e1
  const bankRow = bankRows?.[0]
  if (!bankRow?.id) throw new Error(`bank #${bankTransactionId} not found`)

  const bankAmt = Math.abs(Number(bankRow.amount) || 0)
  const bankStore = String(bankRow.store_name || bankRow.store || '').trim()
  const transDate = String(bankRow.trans_date || '').slice(0, 10)

  const { data: accrualRows, error: e2 } = await supabase
    .from('receivable_transactions')
    .select('id,store_name,amount,invoice_no')
    .in('id', accrualIds)
  if (e2) throw e2
  if ((accrualRows || []).length !== accrualIds.length) {
    throw new Error(`accrual rows missing for bank #${bankTransactionId}`)
  }

  const offsetsByAccrual = new Map()
  for (let i = 0; i < accrualIds.length; i += 80) {
    const chunk = accrualIds.slice(i, i + 80)
    const { data: offsets } = await supabase
      .from('receivable_transactions')
      .select('ref_id,amount')
      .eq('ref_type', 'Receive')
      .in('ref_id', chunk)
    for (const o of offsets || []) {
      const aid = Number(o.ref_id)
      const list = offsetsByAccrual.get(aid) || []
      list.push(o)
      offsetsByAccrual.set(aid, list)
    }
  }

  let selectedTotal = 0
  const linkTargets = []
  for (const accrualId of accrualIds) {
    const accrual = accrualRows.find((r) => Number(r.id) === accrualId)
    if (!accrual) throw new Error(`accrual #${accrualId} missing`)
    if (!storesMatch(accrual.store_name, bankStore)) {
      throw new Error(`store mismatch bank #${bankTransactionId} accrual #${accrualId}`)
    }
    const remaining = computeOpen(accrual.amount, offsetsByAccrual.get(accrualId) || [])
    if (remaining <= 0.009) throw new Error(`accrual #${accrualId} already paid`)
    selectedTotal = round2(selectedTotal + remaining)
    linkTargets.push({ accrualId, accrual, remaining })
  }
  if (Math.abs(bankAmt - selectedTotal) > 0.01) {
    throw new Error(
      `bank #${bankTransactionId} amount ฿${bankAmt} != selected ฿${selectedTotal} (ids ${accrualIds.join(',')})`
    )
  }

  const { error: delErr } = await supabase
    .from('receivable_transactions')
    .delete()
    .eq('bank_transaction_id', bankTransactionId)
    .eq('ref_type', 'Receive')
  if (delErr) throw delErr

  for (const { accrualId, accrual, remaining } of linkTargets) {
    const label = String(accrual.invoice_no || '').trim()
    const memo = label ? `통장 수금 ${label}`.slice(0, 240) : '통장 수금'
    const { error: insErr } = await supabase.from('receivable_transactions').insert({
      store_name: String(accrual.store_name || bankStore),
      amount: -remaining,
      ref_type: 'Receive',
      ref_id: accrualId,
      trans_date: transDate,
      memo,
      receive_checked: false,
      bank_transaction_id: bankTransactionId,
    })
    if (insErr) throw insErr
    const { error: updErr } = await supabase
      .from('receivable_transactions')
      .update({ receive_checked: true })
      .eq('id', accrualId)
    if (updErr) throw updErr
  }
}

async function linkPartialBankToAccrual(bankTransactionId, accrualId, amountAbs) {
  const { data: bankRows, error: e1 } = await supabase
    .from('bank_transactions')
    .select('id,amount,trans_date,store_name,store')
    .eq('id', bankTransactionId)
    .limit(1)
  if (e1) throw e1
  const bankRow = bankRows?.[0]
  if (!bankRow?.id) throw new Error(`bank #${bankTransactionId} not found`)

  const payAbs = round2(Math.abs(Number(amountAbs) || 0))
  const bankAmt = round2(Math.abs(Number(bankRow.amount) || 0))
  if (Math.abs(payAbs - bankAmt) > 0.01) {
    throw new Error(`partial pay ฿${payAbs} != bank ฿${bankAmt}`)
  }

  const { data: accrualRows, error: e2 } = await supabase
    .from('receivable_transactions')
    .select('id,store_name,amount,invoice_no')
    .eq('id', accrualId)
    .limit(1)
  if (e2) throw e2
  const accrual = accrualRows?.[0]
  if (!accrual?.id) throw new Error(`accrual #${accrualId} not found`)

  const bankStore = String(bankRow.store_name || bankRow.store || '').trim()
  if (!storesMatch(accrual.store_name, bankStore)) {
    throw new Error(`store mismatch bank #${bankTransactionId} accrual #${accrualId}`)
  }

  const { data: offsets } = await supabase
    .from('receivable_transactions')
    .select('amount')
    .eq('ref_type', 'Receive')
    .eq('ref_id', accrualId)
  const open = computeOpen(accrual.amount, offsets || [])
  if (open <= 0.009) throw new Error(`accrual #${accrualId} already paid`)
  if (payAbs > open + 0.01) throw new Error(`partial pay ฿${payAbs} > open ฿${open}`)

  const transDate = String(bankRow.trans_date || '').slice(0, 10)
  const label = String(accrual.invoice_no || '').trim()
  const memo = label ? `통장 수금 ${label}`.slice(0, 240) : '통장 수금'

  const { error: delErr } = await supabase
    .from('receivable_transactions')
    .delete()
    .eq('bank_transaction_id', bankTransactionId)
    .eq('ref_type', 'Receive')
  if (delErr) throw delErr

  const { error: insErr } = await supabase.from('receivable_transactions').insert({
    store_name: String(accrual.store_name || bankStore),
    amount: -payAbs,
    ref_type: 'Receive',
    ref_id: accrualId,
    trans_date: transDate,
    memo,
    receive_checked: false,
    bank_transaction_id: bankTransactionId,
  })
  if (insErr) throw insErr

  const remainingAfter = round2(open - payAbs)
  if (remainingAfter <= 0.009) {
    const { error: updErr } = await supabase
      .from('receivable_transactions')
      .update({ receive_checked: true })
      .eq('id', accrualId)
    if (updErr) throw updErr
  }
}

async function listSilomGhostCheckedIds() {
  const { data: accruals, error } = await supabase
    .from('receivable_transactions')
    .select('id')
    .ilike('store_name', '%Silom%')
    .in('ref_type', ['Order', 'ForceOutbound', 'AccountingPO'])
    .eq('receive_checked', true)
    .limit(5000)
  if (error) throw error

  const toFix = []
  for (const a of accruals || []) {
    const { data: offs } = await supabase
      .from('receivable_transactions')
      .select('id')
      .eq('ref_type', 'Receive')
      .eq('ref_id', a.id)
      .limit(1)
    if (!offs?.length) toFix.push(a.id)
  }
  return toFix
}

async function previewBankLink(plan) {
  const { data: bankRows } = await supabase
    .from('bank_transactions')
    .select('id,amount,trans_date,store_name,store')
    .eq('id', plan.bankTransactionId)
    .limit(1)
  const bank = bankRows?.[0]
  if (!bank) return { ok: false, message: 'bank not found' }

  const { data: accruals } = await supabase
    .from('receivable_transactions')
    .select('id,amount,invoice_no,trans_date')
    .in('id', plan.accrualIds)

  const total = round2((accruals || []).reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0))
  const bankAmt = round2(Math.abs(Number(bank.amount) || 0))
  return {
    ok: Math.abs(total - bankAmt) <= 0.01,
    bank,
    accruals: accruals || [],
    total,
    bankAmt,
  }
}

async function main() {
  console.log(`\n=== Future Park / Silom 미수금 정리 ${execute ? '(EXECUTE)' : '(DRY-RUN)'} ===\n`)

  const { data: manualRows, error: mErr } = await supabase
    .from('receivable_transactions')
    .select('id,ref_id,amount,memo')
    .in('id', FUTURE_PARK_MANUAL_RECV_IDS)
  if (mErr) throw mErr

  console.log(`[1] Future Park 수동 수금확인 삭제: ${(manualRows || []).length}건`)
  for (const r of manualRows || []) {
    console.log(`  #${r.id} → accrual #${r.ref_id} ฿${r.amount} | ${String(r.memo || '').slice(0, 42)}`)
  }

  console.log(`\n[2] 중복 통장 통합 수금 삭제 (bank #7613 = #7554 중복): recv ${DUPLICATE_CONSOLIDATED_RECV_IDS.join(', ')}`)

  const silomGhostIds = await listSilomGhostCheckedIds()
  console.log(`\n[3] Silom receive_checked 복원(수금 행 없음): ${silomGhostIds.length}건`)

  console.log('\n[4] 통장 미수 연결:')
  for (const plan of EXPLICIT_BANK_LINKS) {
    const prev = await previewBankLink(plan)
    if (!prev.ok) {
      console.log(`  bank #${plan.bankTransactionId}: 검증 실패 — ${prev.message || 'amount mismatch'}`)
      continue
    }
    console.log(
      `  bank #${plan.bankTransactionId} ฿${prev.bankAmt} → ${plan.accrualIds.length}건 (${plan.note})`
    )
    for (const a of prev.accruals || []) {
      console.log(`    #${a.id} ${a.trans_date} ฿${a.amount} ${a.invoice_no || ''}`)
    }
  }

  if (REMAINING_BANK_LINKS.length) {
    console.log('\n[5] 잔여 통장 미수 연결:')
    for (const plan of REMAINING_BANK_LINKS) {
      const prev = await previewBankLink(plan)
      if (!prev.ok) {
        console.log(`  bank #${plan.bankTransactionId}: 검증 실패`)
        continue
      }
      console.log(`  bank #${plan.bankTransactionId} ฿${prev.bankAmt} → ${plan.accrualIds.length}건 (${plan.note})`)
      for (const a of prev.accruals || []) {
        console.log(`    #${a.id} ${a.trans_date} ฿${a.amount} ${a.invoice_no || ''}`)
      }
    }
  }

  if (PARTIAL_BANK_LINKS.length) {
    console.log('\n[6] 부분 수금 (통장액 < 인보이스):')
    for (const p of PARTIAL_BANK_LINKS) {
      console.log(`  bank #${p.bankTransactionId} ฿${p.amountAbs} → accrual #${p.accrualId} (${p.note})`)
    }
  }

  if (!execute) {
    console.log('\n실행: node scripts/repair-futurepark-silom-receivable.mjs --execute')
    console.log('잔여 통장만: node scripts/repair-futurepark-silom-receivable.mjs --remaining-only --execute\n')
    return
  }

  if (!remainingOnly) {
    if (manualRows?.length) {
      const { error: delErr } = await supabase
        .from('receivable_transactions')
        .delete()
        .in('id', FUTURE_PARK_MANUAL_RECV_IDS)
      if (delErr) throw delErr
      console.log(`\n삭제: 수동 수금확인 ${manualRows.length}건`)
    }

    const accrualIdsFromManual = [
      ...new Set((manualRows || []).map((r) => Number(r.ref_id)).filter((id) => id > 0)),
    ]
    let unchecked = 0
    for (const accrualId of accrualIdsFromManual) {
      const { data: offs } = await supabase
        .from('receivable_transactions')
        .select('id')
        .eq('ref_type', 'Receive')
        .eq('ref_id', accrualId)
        .limit(1)
      if (offs?.length) continue
      const { error } = await supabase
        .from('receivable_transactions')
        .update({ receive_checked: false })
        .eq('id', accrualId)
      if (error) throw error
      unchecked++
    }
    console.log(`receive_checked 복원 (Future Park): ${unchecked}건`)

    if (DUPLICATE_CONSOLIDATED_RECV_IDS.length) {
      const { error } = await supabase
        .from('receivable_transactions')
        .delete()
        .in('id', DUPLICATE_CONSOLIDATED_RECV_IDS)
      if (error) throw error
      console.log(`삭제: 중복 통합 수금 ${DUPLICATE_CONSOLIDATED_RECV_IDS.length}건`)
    }

    if (silomGhostIds.length) {
      const { error } = await supabase
        .from('receivable_transactions')
        .update({ receive_checked: false })
        .in('id', silomGhostIds)
      if (error) throw error
      console.log(`receive_checked 복원 (Silom): ${silomGhostIds.length}건`)
    }

    for (const plan of EXPLICIT_BANK_LINKS) {
      const { data: existing } = await supabase
        .from('receivable_transactions')
        .select('id')
        .eq('bank_transaction_id', plan.bankTransactionId)
        .eq('ref_type', 'Receive')
        .not('ref_id', 'is', null)
        .limit(1)
      if (existing?.length) {
        console.log(`skip bank #${plan.bankTransactionId}: 이미 연결됨`)
        continue
      }
      await linkBankToAccruals(plan.bankTransactionId, plan.accrualIds)
      console.log(`미수 연결: bank #${plan.bankTransactionId} → ${plan.accrualIds.length}건`)
    }
  }

  for (const plan of REMAINING_BANK_LINKS) {
    const { data: existing } = await supabase
      .from('receivable_transactions')
      .select('id')
      .eq('bank_transaction_id', plan.bankTransactionId)
      .eq('ref_type', 'Receive')
      .not('ref_id', 'is', null)
      .limit(1)
    if (existing?.length) {
      console.log(`skip bank #${plan.bankTransactionId}: 이미 연결됨`)
      continue
    }
    await linkBankToAccruals(plan.bankTransactionId, plan.accrualIds)
    console.log(`미수 연결: bank #${plan.bankTransactionId} → ${plan.accrualIds.length}건`)
  }

  for (const p of PARTIAL_BANK_LINKS) {
    const { data: existing } = await supabase
      .from('receivable_transactions')
      .select('id,ref_id')
      .eq('bank_transaction_id', p.bankTransactionId)
      .eq('ref_type', 'Receive')
      .limit(1)
    if (existing?.[0]?.ref_id != null) {
      console.log(`skip bank #${p.bankTransactionId}: 이미 연결됨`)
      continue
    }
    await linkPartialBankToAccrual(p.bankTransactionId, p.accrualId, p.amountAbs)
    console.log(`부분 수금: bank #${p.bankTransactionId} → accrual #${p.accrualId}`)
  }

  console.log('\n완료.')
  console.log('검증: node scripts/check-receivable-double-payment.mjs --start=2026-06-01 --end=2026-06-30\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
