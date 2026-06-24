#!/usr/bin/env node
/**
 * 미수금 이중 수금 패턴 점검
 * A) 동일 bank_transaction_id: 통합(ref null) + 인보이스별(ref set)
 * B) 동일 매장·동일일: 통장 통합 수금 + 수금확인(수동) 인보이스별 합계가 통합 금액과 근접
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

function parseArgs() {
  let start = '2026-06-01'
  let end = new Date().toISOString().slice(0, 10)
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--start=')) start = arg.slice(8).slice(0, 10)
    if (arg.startsWith('--end=')) end = arg.slice(6).slice(0, 10)
  }
  return { start, end }
}

function normStore(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/^cm\s+/, '')
}

function round2(n) {
  return Math.round(n * 100) / 100
}

async function fetchReceives(start, end) {
  const pageSize = 1000
  const out = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('receivable_transactions')
      .select('id,ref_type,ref_id,amount,trans_date,store_name,memo,bank_transaction_id')
      .eq('ref_type', 'Receive')
      .gte('trans_date', start)
      .lte('trans_date', end)
      .order('trans_date')
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
    if (from >= 30000) break
  }
  return out
}

async function main() {
  const { start, end } = parseArgs()
  console.log(`\n=== 미수금 이중 수금 전수 점검 (${start} ~ ${end}) ===\n`)

  const rows = await fetchReceives(start, end)

  // Pattern A
  const byBank = new Map()
  for (const r of rows) {
    const bid = Number(r.bank_transaction_id || 0)
    if (!bid) continue
    if (!byBank.has(bid)) byBank.set(bid, [])
    byBank.get(bid).push(r)
  }
  const patternA = []
  for (const [bankId, list] of byBank) {
    const consolidated = list.filter((r) => r.ref_id == null)
    const invoice = list.filter((r) => r.ref_id != null)
    if (consolidated.length && invoice.length) {
      patternA.push({ bankId, consolidated, invoice, store: list[0]?.store_name, date: list[0]?.trans_date })
    }
  }

  console.log(`[A] 통장 ID당 통합+인보이스별 동시: ${patternA.length}건`)
  for (const p of patternA) {
    console.log(`  bank #${p.bankId} ${p.date} ${p.store}`)
  }

  // Pattern B: store+date groups
  const byStoreDate = new Map()
  for (const r of rows) {
    const key = `${normStore(r.store_name)}|${String(r.trans_date).slice(0, 10)}`
    if (!byStoreDate.has(key)) byStoreDate.set(key, [])
    byStoreDate.get(key).push(r)
  }

  const patternB = []
  for (const [key, list] of byStoreDate) {
    const consolidated = list.filter(
      (r) => r.ref_id == null && r.bank_transaction_id != null && String(r.memo || '').includes('통장')
    )
    const manualInvoice = list.filter(
      (r) =>
        r.ref_id != null &&
        r.bank_transaction_id == null &&
        (String(r.memo || '').startsWith('수금확인') || String(r.memo || '').startsWith('통장 수금'))
    )
    if (!consolidated.length || !manualInvoice.length) continue

    const conTotal = consolidated.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
    const manTotal = manualInvoice.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
    if (Math.abs(conTotal - manTotal) > 0.02) continue

    patternB.push({
      key,
      store: list[0]?.store_name,
      date: list[0]?.trans_date,
      consolidated,
      manualInvoice,
      conTotal: round2(conTotal),
      manTotal: round2(manTotal),
      bankIds: [...new Set(consolidated.map((r) => r.bank_transaction_id))],
    })
  }

  console.log(`\n[B] 통장 통합 수금 + 수금확인(수동) 인보이스별 — 합계 일치: ${patternB.length}건\n`)
  patternB.sort((a, b) => String(a.date).localeCompare(String(b.date)))
  for (const p of patternB) {
    console.log(
      `• ${p.date} | ${p.store} | 통합 ฿${p.conTotal.toLocaleString()} (bank #${p.bankIds.join(',')}) + 수동 ${p.manualInvoice.length}건 ฿${p.manTotal.toLocaleString()}`
    )
    for (const c of p.consolidated) {
      console.log(`    [통합] recv #${c.id} bank=#${c.bank_transaction_id} ฿${c.amount}`)
    }
    for (const m of p.manualInvoice.slice(0, 6)) {
      console.log(`    [수동] recv #${m.id} ref→#${m.ref_id} ฿${m.amount} | ${String(m.memo || '').slice(0, 40)}`)
    }
    if (p.manualInvoice.length > 6) console.log(`    … 외 ${p.manualInvoice.length - 6}건`)
    console.log('')
  }

  // Pattern C: bank-linked invoice receives (통장 수금) without consolidated on same bank — 정상
  const bankInvoiceOnly = []
  for (const [bankId, list] of byBank) {
    const consolidated = list.filter((r) => r.ref_id == null)
    const invoice = list.filter((r) => r.ref_id != null)
    if (!consolidated.length && invoice.length) {
      const total = invoice.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
      bankInvoiceOnly.push({ bankId, invoice, total, store: list[0]?.store_name, date: list[0]?.trans_date })
    }
  }
  console.log(`[C] 인보이스별 통장 연결만 (통합 없음, 정상 가능): ${bankInvoiceOnly.length}건`)

  // Pattern D: same store+date total receive abs > 2x largest single bank deposit hint
  console.log('\n[D] 동일 매장·일자 Receive 절대값 합계 상위 (이중 의심) — 상위 15')
  const sums = []
  for (const [key, list] of byStoreDate) {
    const totalAbs = list.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
    if (totalAbs < 1000) continue
    sums.push({ key, store: list[0]?.store_name, date: list[0]?.trans_date, count: list.length, totalAbs: round2(totalAbs) })
  }
  sums.sort((a, b) => b.totalAbs - a.totalAbs)
  for (const s of sums.slice(0, 15)) {
    const flagged = patternB.some((p) => normStore(p.store) === normStore(s.store) && p.date === s.date)
    console.log(
      `  ${s.date} ${s.store} | ${s.count}건 합 ฿${s.totalAbs.toLocaleString()}${flagged ? ' ← [B] 이중' : ''}`
    )
  }

  console.log('\n완료.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
