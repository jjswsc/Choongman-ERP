#!/usr/bin/env node
/**
 * 입고 Inbound 미지급 금액 → 입고화면과 동일(공급가+줄별 VAT 합)으로 백필
 *
 *   node scripts/apply-inbound-payable-gross-vat-backfill.mjs --dry-run
 *   node scripts/apply-inbound-payable-gross-vat-backfill.mjs --execute
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

function roundErp3(v) {
  const n = Number(v || 0)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1000) / 1000
}
function roundMoney2(v) {
  return Math.round(Number(v || 0) * 100) / 100
}
function normalizeTax(raw) {
  const t = String(raw ?? '').trim().toLowerCase()
  if (t === 'exempt' || t === '면세') return 'exempt'
  if (t === 'zero' || t === '영세율') return 'zero'
  return 'taxable'
}
function formatBangkokYmd(logDateRaw) {
  const v = String(logDateRaw || '').trim()
  if (!v) return ''
  const d = new Date(v.includes('T') ? v : `${v.slice(0, 10)}T12:00:00+07:00`)
  if (Number.isNaN(d.getTime())) return v.slice(0, 10)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}
/** 입고 내역과 동일: 줄별 VAT 후 합산 */
function computeGross(lines, taxByCode) {
  let netTotal = 0
  let vatTotal = 0
  let batchDateYmd = ''
  for (const line of lines) {
    const code = String(line.code || '').trim()
    const qty = Math.max(0, Number(line.qty) || 0)
    const unit = Math.max(0, Number(line.unitCost) || 0)
    if (!code || qty <= 0) continue
    const net = roundErp3(qty * unit)
    const taxType = taxByCode.get(code) || 'taxable'
    const rate = taxType === 'exempt' || taxType === 'zero' ? 0 : 0.07
    const vat = roundMoney2(net * rate)
    netTotal = roundMoney2(netTotal + net)
    vatTotal = roundMoney2(vatTotal + vat)
    const ymd = line.dateYmd || ''
    if (ymd && (!batchDateYmd || ymd > batchDateYmd)) batchDateYmd = ymd
  }
  return { netTotal, vatTotal, grossTotal: roundMoney2(netTotal + vatTotal), batchDateYmd }
}

async function fetchAll(table, select, apply) {
  const out = []
  let from = 0
  const page = 1000
  while (true) {
    let q = supabase.from(table).select(select).order('id').range(from, from + page - 1)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < page) break
    from += page
    if (from >= 300_000) break
  }
  return out
}

async function main() {
  console.log(`\n=== 입고 미지급 VAT 포함 백필 ${execute ? '(EXECUTE)' : '(DRY-RUN)'} ===\n`)

  const pays = await fetchAll(
    'payable_transactions',
    'id,amount,ref_id,trans_date,memo,vendor_code',
    (q) => q.eq('ref_type', 'Inbound').not('ref_id', 'is', null)
  )
  console.log(`Inbound payable ${pays.length}건`)

  const batchIds = [...new Set(pays.map((p) => Number(p.ref_id)).filter((id) => id > 0))]
  const batches = []
  for (let i = 0; i < batchIds.length; i += 200) {
    const slice = batchIds.slice(i, i + 200)
    const { data, error } = await supabase
      .from('inbound_batches')
      .select('id,total_amount,batch_date,vendor_name,vendor_code')
      .in('id', slice)
    if (error) throw error
    batches.push(...(data || []))
  }
  const batchById = new Map(batches.map((b) => [Number(b.id), b]))

  const logs = []
  for (let i = 0; i < batchIds.length; i += 100) {
    const slice = batchIds.slice(i, i + 100)
    const { data, error } = await supabase
      .from('stock_logs')
      .select('inbound_batch_id,item_code,qty,unit_cost,log_date,log_type')
      .in('inbound_batch_id', slice)
      .eq('log_type', 'Inbound')
    if (error) throw error
    logs.push(...(data || []))
  }

  const logsByBatch = new Map()
  for (const row of logs) {
    const bid = Number(row.inbound_batch_id)
    if (!logsByBatch.has(bid)) logsByBatch.set(bid, [])
    logsByBatch.get(bid).push(row)
  }

  const codes = [...new Set(logs.map((l) => String(l.item_code || '').trim()).filter(Boolean))]
  const items = []
  for (let i = 0; i < codes.length; i += 200) {
    const slice = codes.slice(i, i + 200)
    const { data, error } = await supabase.from('items').select('code,tax').in('code', slice)
    if (error) throw error
    items.push(...(data || []))
  }
  const taxByCode = new Map(items.map((r) => [String(r.code || '').trim(), normalizeTax(r.tax)]))

  const plans = []
  for (const pay of pays) {
    const bid = Number(pay.ref_id)
    const batchLogs = logsByBatch.get(bid) || []
    if (!batchLogs.length) continue
    const lines = batchLogs
      .map((row) => ({
        code: String(row.item_code || '').trim(),
        qty: Number(row.qty) || 0,
        unitCost: row.unit_cost != null && !Number.isNaN(Number(row.unit_cost)) ? Number(row.unit_cost) : 0,
        dateYmd: formatBangkokYmd(row.log_date),
      }))
      .filter((l) => l.code && l.qty > 0)
    if (!lines.length) continue
    const { grossTotal, batchDateYmd, netTotal, vatTotal } = computeGross(lines, taxByCode)
    if (grossTotal <= 0 || !batchDateYmd) continue
    const oldAmt = Math.abs(Number(pay.amount) || 0)
    const batch = batchById.get(bid)
    const needsPay = Math.abs(oldAmt - grossTotal) > 0.02
    const needsBatch = batch && Math.abs(Number(batch.total_amount || 0) - grossTotal) > 0.02
    if (!needsPay && !needsBatch) continue
    plans.push({
      payId: Number(pay.id),
      batchId: bid,
      vendor: pay.vendor_code,
      date: batchDateYmd,
      oldAmt,
      netTotal,
      vatTotal,
      grossTotal,
      needsPay,
      needsBatch: Boolean(needsBatch),
      vendorName: String(batch?.vendor_name || '').trim(),
    })
  }

  console.log(`보정 대상: ${plans.length}건\n`)
  for (const p of plans.slice(0, 40)) {
    const d = p.grossTotal - p.oldAmt
    console.log(
      `batch#${p.batchId} pay#${p.payId} ${p.vendor} ${p.date} ${p.oldAmt} → ${p.grossTotal} (net ${p.netTotal} + vat ${p.vatTotal}, Δ ${d.toFixed(2)})`
    )
  }
  if (plans.length > 40) console.log(`  … 외 ${plans.length - 40}건`)
  const fullDelta = plans.reduce((s, p) => s + (p.grossTotal - p.oldAmt), 0)
  console.log(`\n미지급 금액 증가 합계(대략): ฿${fullDelta.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)

  if (!execute) {
    console.log('\n실행: node scripts/apply-inbound-payable-gross-vat-backfill.mjs --execute\n')
    return
  }

  let ok = 0
  for (const p of plans) {
    if (p.needsBatch) {
      const { error } = await supabase
        .from('inbound_batches')
        .update({ total_amount: p.grossTotal, batch_date: p.date })
        .eq('id', p.batchId)
      if (error) throw error
    }
    if (p.needsPay) {
      const memo = `입고 ${p.date} ${p.vendorName || p.vendor || '-'}`.slice(0, 240)
      const { error } = await supabase
        .from('payable_transactions')
        .update({ amount: p.grossTotal, trans_date: p.date, memo })
        .eq('id', p.payId)
      if (error) throw error
    }
    ok++
  }
  console.log(`\n완료: ${ok}건 갱신\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
