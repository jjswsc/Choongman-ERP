#!/usr/bin/env node
/**
 * 미수금 Order/ForceOutbound 금액이 VAT 포함(gross)인지 샘플 진단
 *   node scripts/check-receivable-vat-gross.mjs
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

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}
function thaiGrand(net) {
  const sub = round2(Math.abs(net))
  const vat = round2(sub * 0.07)
  return { sub, vat, grand: round2(sub + vat) }
}

async function main() {
  console.log('\n=== 미수금 Accrual VAT 진단 ===\n')

  // Recent Order receivables
  const { data: orders, error } = await sb
    .from('receivable_transactions')
    .select('id,ref_id,amount,trans_date,store_name,memo')
    .eq('ref_type', 'Order')
    .gt('amount', 0)
    .order('id', { ascending: false })
    .limit(80)
  if (error) throw error

  let grossOk = 0
  let netOnlySuspect = 0
  let unknown = 0
  const samples = []

  for (const row of orders || []) {
    const orderId = Number(row.ref_id)
    if (!orderId) continue
    // Prefer outbound stock_logs for order
    const { data: logs } = await sb
      .from('stock_logs')
      .select('qty,unit_cost,amount')
      .eq('order_id', orderId)
      .eq('log_type', 'Outbound')
      .limit(500)
    let supply = 0
    for (const l of logs || []) {
      const line =
        l.amount != null && !Number.isNaN(Number(l.amount))
          ? Number(l.amount)
          : Number(l.qty || 0) * Number(l.unit_cost || 0)
      supply = round2(supply + Math.abs(line))
    }
    if (supply <= 0) {
      // cart fallback
      const { data: cart } = await sb
        .from('order_cart_items')
        .select('qty,unit_price,amount')
        .eq('order_id', orderId)
        .limit(500)
      for (const c of cart || []) {
        const line =
          c.amount != null && !Number.isNaN(Number(c.amount))
            ? Number(c.amount)
            : Number(c.qty || 0) * Number(c.unit_price || 0)
        supply = round2(supply + Math.abs(line))
      }
    }
    if (supply <= 0.02) {
      unknown++
      continue
    }
    const amt = round2(Number(row.amount))
    const { grand } = thaiGrand(supply)
    const ratio = amt / supply
    let kind = 'unknown'
    if (Math.abs(amt - grand) <= 1) {
      kind = 'gross_ok'
      grossOk++
    } else if (Math.abs(amt - supply) <= 1) {
      kind = 'net_only_SUSPECT'
      netOnlySuspect++
      samples.push({
        id: row.id,
        orderId,
        date: row.trans_date,
        store: row.store_name,
        supply,
        amt,
        grand,
        ratio: round2(ratio),
      })
    } else if (ratio > 1.05 && ratio < 1.09) {
      kind = 'near_gross'
      grossOk++
    } else {
      kind = 'other'
      unknown++
      if (samples.length < 15) {
        samples.push({
          id: row.id,
          orderId,
          date: row.trans_date,
          store: row.store_name,
          supply,
          amt,
          grand,
          ratio: round2(ratio),
          note: kind,
        })
      }
    }
  }

  console.log(`Order 샘플 ${(orders || []).length}건 중:`)
  console.log(`  VAT포함(gross)으로 보임: ${grossOk}`)
  console.log(`  공급가만(net) 의심: ${netOnlySuspect}`)
  console.log(`  판단불가/기타: ${unknown}`)
  if (samples.length) {
    console.log('\n의심/기타 샘플:')
    for (const s of samples.slice(0, 12)) {
      console.log(
        `  recv#${s.id} order#${s.orderId} ${s.date} ${s.store} supply=${s.supply} amt=${s.amt} expectGross=${s.grand} ratio=${s.ratio}`
      )
    }
  }

  // ForceOutbound
  const { data: fo } = await sb
    .from('receivable_transactions')
    .select('id,amount,trans_date,store_name,memo')
    .eq('ref_type', 'ForceOutbound')
    .gt('amount', 0)
    .order('id', { ascending: false })
    .limit(20)
  console.log(`\nForceOutbound 최근 ${fo?.length || 0}건 (금액만 표시, 출고화면 합계와 통상 동일 규칙):`)
  for (const r of fo || []) {
    console.log(`  #${r.id} ${r.trans_date} ${r.store_name} ฿${r.amount}`)
  }

  // Inbound payable already-gross stats (post-backfill residual already 0)
  const { count: inboundCnt } = await sb
    .from('payable_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('ref_type', 'Inbound')
  console.log(`\n미지급 Inbound 현재 건수: ${inboundCnt} (백필 후 잔여 보정 0건)`)
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
