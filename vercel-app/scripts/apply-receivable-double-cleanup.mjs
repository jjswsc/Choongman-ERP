#!/usr/bin/env node
/**
 * 패턴 B 이중 수금 정리 — 수동 수금확인 삭제 + receive_checked 복원
 *   node scripts/apply-receivable-double-cleanup.mjs --dry-run
 *   node scripts/apply-receivable-double-cleanup.mjs --execute
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
const start = '2026-06-01'
const end = '2026-06-30'

function normStore(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/^cm\s+/, '')
}

async function fetchReceives() {
  const pageSize = 1000
  const out = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('receivable_transactions')
      .select('id,ref_type,ref_id,amount,trans_date,store_name,memo,bank_transaction_id,receive_checked')
      .eq('ref_type', 'Receive')
      .gte('trans_date', start)
      .lte('trans_date', end)
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

function buildPlan(rows) {
  const consolidated = rows.filter(
    (r) => r.ref_id == null && r.bank_transaction_id != null && String(r.memo || '').startsWith('통장')
  )
  const manual = rows.filter(
    (r) =>
      r.ref_id != null &&
      r.bank_transaction_id == null &&
      String(r.memo || '').startsWith('수금확인')
  )

  const conByDay = new Map()
  for (const r of consolidated) {
    const key = `${normStore(r.store_name)}|${String(r.trans_date).slice(0, 10)}`
    if (!conByDay.has(key)) conByDay.set(key, { store: r.store_name, date: r.trans_date, rows: [] })
    conByDay.get(key).rows.push(r)
  }
  const manByDay = new Map()
  for (const r of manual) {
    const key = `${normStore(r.store_name)}|${String(r.trans_date).slice(0, 10)}`
    if (!manByDay.has(key)) manByDay.set(key, { rows: [] })
    manByDay.get(key).rows.push(r)
  }

  const plan = []
  for (const [key, con] of conByDay) {
    const man = manByDay.get(key)
    if (!man?.rows.length) continue
    const conTotal = con.rows.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
    const manTotal = man.rows.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
    if (Math.abs(conTotal - manTotal) > 0.02) continue
    plan.push({
      store: con.store,
      date: String(con.date).slice(0, 10),
      conTotal,
      manTotal,
      manualIds: man.rows.map((r) => r.id),
      accrualIds: [...new Set(man.rows.map((r) => Number(r.ref_id)).filter((id) => id > 0))],
      bankIds: con.rows.map((r) => r.bank_transaction_id),
    })
  }
  return plan
}

async function main() {
  console.log(`\n=== 이중 수금 정리 ${execute ? '(EXECUTE)' : '(DRY-RUN)'} ===\n`)
  const rows = await fetchReceives()
  const plan = buildPlan(rows)
  if (!plan.length) {
    console.log('정리 대상 없음')
    return
  }

  const allManualIds = plan.flatMap((p) => p.manualIds)
  const allAccrualIds = [...new Set(plan.flatMap((p) => p.accrualIds))]

  for (const p of plan) {
    console.log(
      `${p.date} ${p.store} | 통합 ฿${p.conTotal.toLocaleString()} (bank ${p.bankIds.join(',')}) → 수동 ${p.manualIds.length}건 삭제`
    )
  }
  console.log(`\n총 ${plan.length} 매장·일자, 수동 Receive ${allManualIds.length}건 삭제, accrual ${allAccrualIds.length}건 unchecked 예정\n`)

  if (!execute) {
    console.log('실행하려면: node scripts/apply-receivable-double-cleanup.mjs --execute\n')
    return
  }

  const { error: delErr } = await supabase
    .from('receivable_transactions')
    .delete()
    .in('id', allManualIds)
  if (delErr) throw delErr
  console.log(`삭제 완료: ${allManualIds.length}건`)

  let unchecked = 0
  for (const accrualId of allAccrualIds) {
    const { data: offsets } = await supabase
      .from('receivable_transactions')
      .select('id')
      .eq('ref_type', 'Receive')
      .eq('ref_id', accrualId)
      .limit(1)
    if (offsets?.length) continue
    const { error } = await supabase
      .from('receivable_transactions')
      .update({ receive_checked: false })
      .eq('id', accrualId)
    if (error) throw error
    unchecked++
  }
  console.log(`receive_checked 복원: ${unchecked}건`)
  console.log('\n완료. 검증: node scripts/check-receivable-double-payment.mjs --start=2026-06-01 --end=2026-06-30\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
