#!/usr/bin/env node
/**
 * 통장 입금 ↔ 미수금 이중 수금 점검
 * Usage: node scripts/check-receivable-bank-duplicate.mjs [--start=2026-06-01] [--end=2026-12-31]
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
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (.env.local)')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

function parseArgs() {
  let start = '2026-06-01'
  let end = new Date().toISOString().slice(0, 10)
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--start=')) start = arg.slice(8).slice(0, 10)
    if (arg.startsWith('--end=')) end = arg.slice(6).slice(0, 10)
  }
  return { start, end }
}

async function fetchAllReceives(start, end) {
  const pageSize = 1000
  const out = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('receivable_transactions')
      .select('id,bank_transaction_id,ref_id,amount,memo,trans_date,store_name')
      .eq('ref_type', 'Receive')
      .not('bank_transaction_id', 'is', null)
      .gte('trans_date', start)
      .lte('trans_date', end)
      .order('trans_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
    if (from >= 20000) break
  }
  return out
}

async function main() {
  const { start, end } = parseArgs()
  console.log(`\n=== 미수금 통장 이중 수금 점검 (${start} ~ ${end}) ===\n`)

  const recvRows = await fetchAllReceives(start, end)
  const byBank = new Map()
  for (const r of recvRows) {
    const bid = Number(r.bank_transaction_id || 0)
    if (!bid) continue
    if (!byBank.has(bid)) byBank.set(bid, [])
    byBank.get(bid).push(r)
  }

  const duplicates = []
  for (const [bankTransactionId, rows] of byBank) {
    const consolidated = rows.filter((r) => r.ref_id == null)
    const invoiceLevel = rows.filter((r) => r.ref_id != null)
    if (!consolidated.length || !invoiceLevel.length) continue
    const consolidatedTotal = consolidated.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
    const invoiceTotal = invoiceLevel.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
    duplicates.push({
      bankTransactionId,
      consolidated,
      invoiceLevel,
      consolidatedTotal: Math.round(consolidatedTotal * 100) / 100,
      invoiceTotal: Math.round(invoiceTotal * 100) / 100,
      storeName: String(rows[0]?.store_name || ''),
      transDate: String(rows[0]?.trans_date || '').slice(0, 10),
    })
  }

  if (!duplicates.length) {
    console.log('이중 반영(통합+인보이스별 동시 존재): 없음')
  } else {
    console.log(`이중 반영 건수: ${duplicates.length}개 통장 입금\n`)
    duplicates.sort((a, b) => a.transDate.localeCompare(b.transDate) || a.bankTransactionId - b.bankTransactionId)
    for (const d of duplicates) {
      console.log(
        `• bank_tx #${d.bankTransactionId} | ${d.transDate} | ${d.storeName} | 통합 ฿${d.consolidatedTotal.toLocaleString()} + 인보이스 ${d.invoiceLevel.length}건 ฿${d.invoiceTotal.toLocaleString()}`
      )
      for (const c of d.consolidated) {
        console.log(`    [통합] recv #${c.id} ฿${c.amount} — ${String(c.memo || '').slice(0, 70)}`)
      }
      for (const inv of d.invoiceLevel.slice(0, 8)) {
        console.log(`    [인보이스] recv #${inv.id} ref→#${inv.ref_id} ฿${inv.amount}`)
      }
      if (d.invoiceLevel.length > 8) console.log(`    … 외 ${d.invoiceLevel.length - 8}건`)
      console.log('')
    }
  }

  const spotIds = [7611, 7811]
  const spotRows = recvRows.filter((r) => spotIds.includes(Number(r.bank_transaction_id)))
  console.log('\n--- Silom 통장 ID 7611 / 7811 상세 ---')
  for (const id of spotIds) {
    const rows = spotRows.filter((r) => Number(r.bank_transaction_id) === id)
    if (!rows.length) {
      console.log(`bank_tx #${id}: bank_transaction_id 연결 Receive 없음`)
      continue
    }
    console.log(`bank_tx #${id}: ${rows.length}건`)
    for (const r of rows) {
      console.log(`  recv #${r.id} ref_id=${r.ref_id ?? 'null'} amt=${r.amount} | ${String(r.memo || '').slice(0, 50)}`)
    }
  }

  // 수동 수금(bank_tx null) + 통장 연결 인보이스 수금 — 동일 매장·동일일 중복 가능
  console.log('\n--- 부가: 통장 미연결 수동 수금 + 동일일·매장 인보이스별 통장 수금 ---')
  const { data: manualRecv, error: manualErr } = await supabase
    .from('receivable_transactions')
    .select('id,ref_id,amount,trans_date,store_name,memo')
    .eq('ref_type', 'Receive')
    .is('bank_transaction_id', null)
    .not('ref_id', 'is', null)
    .gte('trans_date', start)
    .lte('trans_date', end)
    .limit(5000)
  if (manualErr) throw manualErr

  let manualDupHint = 0
  for (const m of manualRecv || []) {
    const refId = Number(m.ref_id)
    const linked = recvRows.filter(
      (r) => Number(r.ref_id) === refId && r.bank_transaction_id != null
    )
    if (linked.length) {
      manualDupHint++
      if (manualDupHint <= 10) {
        console.log(
          `• accrual #${refId} | ${m.trans_date} ${m.store_name} | 수동 recv #${m.id} ฿${m.amount} + 통장 recv #${linked.map((x) => x.id).join(',')}`
        )
      }
    }
  }
  if (manualDupHint === 0) console.log('해당 없음')
  else if (manualDupHint > 10) console.log(`… 외 ${manualDupHint - 10}건`)

  console.log('\n완료.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
