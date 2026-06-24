#!/usr/bin/env node
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

async function main() {
  const date = '2026-06-18'
  const storePattern = '%silom%'

  console.log(`\n=== Silom ${date} 미수금 전체 ===\n`)

  const { data: silomRecv, error: e1 } = await supabase
    .from('receivable_transactions')
    .select('id,ref_type,ref_id,amount,trans_date,store_name,memo,bank_transaction_id,receive_checked')
    .ilike('store_name', storePattern)
    .eq('trans_date', date)
    .order('id', { ascending: true })
  if (e1) throw e1

  const receives = (silomRecv || []).filter((r) => r.ref_type === 'Receive')
  const orders = (silomRecv || []).filter((r) =>
    ['Order', 'ForceOutbound', 'AccountingPO'].includes(String(r.ref_type))
  )

  console.log(`Receive ${receives.length}건 / 발생(주문·출고) ${orders.length}건\n`)

  let recvSum = 0
  for (const r of receives) {
    recvSum += Number(r.amount) || 0
    console.log(
      `#${r.id} ${r.ref_type} ref=${r.ref_id ?? 'null'} bank=${r.bank_transaction_id ?? 'null'} amt=${r.amount} checked=${r.receive_checked} | ${String(r.memo || '').slice(0, 55)}`
    )
  }
  console.log(`\nReceive 합계: ฿${recvSum.toLocaleString()}`)

  const bankLinked = receives.filter((r) => r.bank_transaction_id != null)
  const invoiceLinked = receives.filter((r) => r.ref_id != null)
  const consolidated = receives.filter((r) => r.ref_id == null)
  console.log(`\n분류: 통합(ref null) ${consolidated.length} | 인보이스별(ref set) ${invoiceLinked.length} | bank_tx 연결 ${bankLinked.length}`)

  // 통장 수금 memo 인보이스별 (bank_tx 유무 무관)
  const { data: bankMemoRecv, error: e2 } = await supabase
    .from('receivable_transactions')
    .select('id,ref_id,amount,trans_date,store_name,memo,bank_transaction_id')
    .eq('ref_type', 'Receive')
    .not('ref_id', 'is', null)
    .gte('trans_date', '2026-06-01')
    .lte('trans_date', '2026-06-30')
    .or('memo.ilike.통장 수금%,memo.ilike.통장 수령%')
    .order('trans_date')
    .limit(5000)
  if (e2) throw e2

  const byStore = new Map()
  for (const r of bankMemoRecv || []) {
    const k = String(r.store_name || '')
    if (!byStore.has(k)) byStore.set(k, [])
    byStore.get(k).push(r)
  }

  console.log('\n=== 2026-06 전체 — 인보이스별 「통장 수금/수령」 Receive ===\n')
  for (const [store, rows] of [...byStore.entries()].sort()) {
    const withBank = rows.filter((r) => r.bank_transaction_id != null)
    const noBank = rows.filter((r) => r.bank_transaction_id == null)
    const total = rows.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0)
    console.log(`${store}: ${rows.length}건 (bank연결 ${withBank.length}, 수동 ${noBank.length}) 합 ฿${total.toLocaleString()}`)
  }

  // 전 매장: 동일 accrual에 Receive 2건 이상
  console.log('\n=== 2026-06 — 동일 인보이스(accrual)에 Receive 2건 이상 ===\n')
  const { data: juneInvRecv, error: e3 } = await supabase
    .from('receivable_transactions')
    .select('id,ref_id,amount,trans_date,store_name,bank_transaction_id,memo')
    .eq('ref_type', 'Receive')
    .not('ref_id', 'is', null)
    .gte('trans_date', '2026-06-01')
    .lte('trans_date', '2026-06-30')
    .limit(10000)
  if (e3) throw e3

  const byAccrual = new Map()
  for (const r of juneInvRecv || []) {
    const aid = Number(r.ref_id)
    if (!byAccrual.has(aid)) byAccrual.set(aid, [])
    byAccrual.get(aid).push(r)
  }
  let multiCount = 0
  for (const [aid, rows] of byAccrual) {
    if (rows.length < 2) continue
    multiCount++
    if (multiCount <= 20) {
      const store = rows[0]?.store_name
      const date0 = rows[0]?.trans_date
      console.log(`accrual #${aid} | ${date0} ${store} | ${rows.length}건 Receive:`)
      for (const r of rows) {
        console.log(`  recv #${r.id} bank=${r.bank_transaction_id ?? 'null'} amt=${r.amount}`)
      }
    }
  }
  if (multiCount === 0) console.log('없음')
  else if (multiCount > 20) console.log(`… 외 ${multiCount - 20}건`)

  // bank 7811
  const { data: bt7811 } = await supabase
    .from('bank_transactions')
    .select('id,trans_date,amount,store_name,store,memo,category')
    .eq('id', 7811)
    .maybeSingle()
  const { data: bt7611 } = await supabase
    .from('bank_transactions')
    .select('id,trans_date,amount,store_name,store,memo,category')
    .eq('id', 7611)
    .maybeSingle()

  console.log('\n=== 통장 거래 7611 / 7811 ===')
  for (const bt of [bt7611, bt7811]) {
    if (!bt) continue
    console.log(
      `#${bt.id} ${bt.trans_date} ${bt.store_name || bt.store} cat=${bt.category} amt=${bt.amount} | ${String(bt.memo || '').slice(0, 60)}`
    )
  }

  const { data: recv7811 } = await supabase
    .from('receivable_transactions')
    .select('*')
    .or('bank_transaction_id.eq.7811,memo.ilike.%7811%')
    .eq('ref_type', 'Receive')
  console.log(`\n7811 관련 Receive (bank_tx 또는 memo): ${(recv7811 || []).length}건`)
  for (const r of recv7811 || []) {
    console.log(`  #${r.id} ref=${r.ref_id} bank=${r.bank_transaction_id} amt=${r.amount} ${r.trans_date}`)
  }

  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
