#!/usr/bin/env node
/**
 * 미수금(통장 연동 Receive) 적요 정리 — 은행 적요 우선
 * 동일 bank_transaction_id 에 Receive(ref_id null) 중복이면 최신 1건만 유지.
 *
 *   node scripts/apply-receivable-bank-memo-cleanup.mjs --dry-run
 *   node scripts/apply-receivable-bank-memo-cleanup.mjs --execute
 *
 * 이중 수금(통장 통합 + 수금확인 수동)은 apply-receivable-double-cleanup.mjs 참고.
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

function parseArgs() {
  let start = null
  let end = null
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--start=')) start = arg.slice(8).slice(0, 10)
    if (arg.startsWith('--end=')) end = arg.slice(6).slice(0, 10)
  }
  return { start, end }
}

function buildMemo(bankMemo) {
  const m = String(bankMemo || '').trim()
  return m ? `통장 수령: ${m}`.slice(0, 240) : '통장 수령'
}

async function fetchReceives(start, end) {
  const pageSize = 1000
  const out = []
  let from = 0
  while (true) {
    let q = supabase
      .from('receivable_transactions')
      .select('id,store_name,amount,trans_date,memo,bank_transaction_id,ref_id,ref_type')
      .eq('ref_type', 'Receive')
      .is('ref_id', null)
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

async function fetchBanks(ids) {
  const unique = [...new Set(ids.map((id) => Number(id)).filter((id) => id > 0))]
  const map = new Map()
  for (let i = 0; i < unique.length; i += 200) {
    const slice = unique.slice(i, i + 200)
    const { data, error } = await supabase.from('bank_transactions').select('id,memo').in('id', slice)
    if (error) throw error
    for (const row of data || []) map.set(Number(row.id), row)
  }
  return map
}

async function main() {
  const { start, end } = parseArgs()
  console.log(
    `\n=== 미수금 통장 Receive 적요 정리 ${execute ? '(EXECUTE)' : '(DRY-RUN)'} ===` +
      `\n기간: ${start || '전체'} ~ ${end || '전체'}\n`
  )

  const rows = await fetchReceives(start, end)
  console.log(`통장 통합 Receive ${rows.length}건\n`)

  const byBank = new Map()
  for (const r of rows) {
    const bankId = Number(r.bank_transaction_id || 0)
    if (!bankId) continue
    if (!byBank.has(bankId)) byBank.set(bankId, [])
    byBank.get(bankId).push(r)
  }

  const deleteIds = []
  let dupGroups = 0
  for (const [, bucket] of byBank) {
    if (bucket.length < 2) continue
    dupGroups++
    const keeper = bucket.reduce((a, b) => (Number(a.id) > Number(b.id) ? a : b))
    for (const r of bucket) {
      if (Number(r.id) !== Number(keeper.id)) deleteIds.push(Number(r.id))
    }
  }
  console.log(`【1】동일 통장 Receive 중복 그룹 ${dupGroups} → 삭제 ${deleteIds.length}건`)

  const deleteSet = new Set(deleteIds)
  const survivors = rows.filter((r) => !deleteSet.has(Number(r.id)))
  const bankMap = await fetchBanks(survivors.map((r) => r.bank_transaction_id))

  const memoUpdates = []
  for (const r of survivors) {
    const bank = bankMap.get(Number(r.bank_transaction_id))
    if (!bank) continue
    const desired = buildMemo(bank.memo)
    const current = String(r.memo || '').trim()
    if (current === desired) continue
    if (!String(bank.memo || '').trim() && current.startsWith('통장 수령')) continue
    memoUpdates.push({
      id: Number(r.id),
      bankId: Number(r.bank_transaction_id),
      from: current.slice(0, 100),
      to: desired.slice(0, 100),
    })
  }
  console.log(`【2】은행 적요로 memo 갱신 예정: ${memoUpdates.length}건`)
  for (const u of memoUpdates.slice(0, 20)) {
    console.log(`  recv#${u.id} bank#${u.bankId}\n    ← ${u.from}\n    → ${u.to}`)
  }
  if (memoUpdates.length > 20) console.log(`  … 외 ${memoUpdates.length - 20}건`)

  if (!execute) {
    console.log('\n실행하려면: node scripts/apply-receivable-bank-memo-cleanup.mjs --execute')
    console.log('이중 수금(수금확인) 정리는: node scripts/apply-receivable-double-cleanup.mjs --dry-run\n')
    return
  }

  if (deleteIds.length) {
    for (let i = 0; i < deleteIds.length; i += 100) {
      const slice = deleteIds.slice(i, i + 100)
      const { error } = await supabase.from('receivable_transactions').delete().in('id', slice)
      if (error) throw error
    }
    console.log(`\n삭제 완료: ${deleteIds.length}건`)
  }

  for (const u of memoUpdates) {
    const bank = bankMap.get(u.bankId)
    const memo = buildMemo(bank?.memo)
    const { error } = await supabase.from('receivable_transactions').update({ memo }).eq('id', u.id)
    if (error) throw error
  }
  console.log(`적요 갱신 완료: ${memoUpdates.length}건\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
