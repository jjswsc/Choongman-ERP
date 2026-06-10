/**
 * CM Ekkamai 2026-05 — PP30 매입 누락 진단
 * Usage: node scripts/pp30-ekamai-gap-diagnostic.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TAX_MONTH = '2026-05'
const START = '2026-05-01'
const END = '2026-05-31'
const STORE_PATTERNS = ['ekkamai', 'ekamai', '에까마이', 'เอกมัย']

function loadEnvLocal() {
  const p = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '')
    .replace(/\s+/g, ' ')
}

function matchesStore(raw) {
  const n = norm(raw)
  if (!n) return false
  return STORE_PATTERNS.some((p) => n.includes(norm(p)) || norm(p).includes(n))
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function sum(rows, key) {
  return round2(rows.reduce((a, r) => a + (Number(r[key]) || 0), 0))
}

function parseCategory(note) {
  const m = String(note || '').match(/withdrawal_category:([a-z_]+)/i)
  return (m?.[1] || '').trim().toLowerCase()
}

function inMonthYmd(ymd) {
  const s = String(ymd || '').slice(0, 10)
  return s >= START && s <= END
}

async function fetchAll(sb, table, select, filterFn, pageSize = 1000) {
  const out = []
  let from = 0
  while (true) {
    let q = sb.from(table).select(select).range(from, from + pageSize - 1)
    if (filterFn) q = filterFn(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = data || []
    out.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
    if (from > 120000) break
  }
  return out
}

async function main() {
  loadEnvLocal()
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local')
    process.exit(1)
  }
  const sb = createClient(url, key)

  console.log(`\n=== PP30 매입 진단: CM Ekkamai / ${TAX_MONTH} ===\n`)

  // erp_stores
  const { data: erpStores } = await sb.from('erp_stores').select('store_code,display_name,aliases').order('sort_order')
  const ekkamaiStores = (erpStores || []).filter(
    (s) =>
      matchesStore(s.store_code) ||
      matchesStore(s.display_name) ||
      (Array.isArray(s.aliases) && s.aliases.some((a) => matchesStore(a)))
  )
  console.log('1) erp_stores (Ekkamai)')
  for (const s of ekkamaiStores) {
    console.log(`   - ${s.store_code} | ${s.display_name} | aliases: ${(s.aliases || []).join(', ')}`)
  }
  if (!ekkamaiStores.length) console.log('   (없음 — store_name 매칭 실패 가능)')

  // VAT ledger input
  const vatAll = await fetchAll(sb, 'vat_ledger_entries', '*', (q) => q.eq('tax_month', TAX_MONTH))
  const vatInput = vatAll.filter(
    (r) => String(r.direction || '').toLowerCase() === 'input' && matchesStore(r.store_name)
  )
  const vatOutput = vatAll.filter(
    (r) => String(r.direction || '').toLowerCase() === 'output' && matchesStore(r.store_name)
  )

  console.log('\n2) vat_ledger_entries (PP30 반영 결과)')
  console.log(`   매입(input): ${vatInput.length}건 | 공급가 ${sum(vatInput, 'net_amount').toLocaleString()} | VAT ${sum(vatInput, 'vat_amount').toLocaleString()}`)
  console.log(`   매출(output): ${vatOutput.length}건 | 공급가 ${sum(vatOutput, 'net_amount').toLocaleString()} | VAT ${sum(vatOutput, 'vat_amount').toLocaleString()}`)

  const vatBySource = { stock: [], expense: [], bank: [], petty: [], manual: [], other: [] }
  for (const r of vatInput) {
    const memo = String(r.memo || '')
    if (memo.includes('[AUTO:STOCK_LOG:')) vatBySource.stock.push(r)
    else if (memo.includes('[AUTO:EXPENSE_ACCRUAL:')) vatBySource.expense.push(r)
    else if (memo.includes('[AUTO:BANK_TX:')) vatBySource.bank.push(r)
    else if (memo.includes('[AUTO:PETTY_CASH:')) vatBySource.petty.push(r)
    else if (memo.includes('[AUTO:')) vatBySource.other.push(r)
    else vatBySource.manual.push(r)
  }
  console.log('   매입 소스별:')
  for (const [k, rows] of Object.entries(vatBySource)) {
    if (!rows.length) continue
    console.log(
      `     ${k}: ${rows.length}건 | net ${sum(rows, 'net_amount').toLocaleString()} | vat ${sum(rows, 'vat_amount').toLocaleString()}`
    )
  }

  const vatByVendor = new Map()
  for (const r of vatInput) {
    const name = String(r.counterparty_name || '(미지정)').trim()
    const prev = vatByVendor.get(name) || { count: 0, net: 0, vat: 0, pending: 0 }
    prev.count += 1
    prev.net += Number(r.net_amount) || 0
    prev.vat += Number(r.vat_amount) || 0
    if (String(r.invoice_evidence_status || '') === 'required_pending') prev.pending += Number(r.vat_amount) || 0
    vatByVendor.set(name, prev)
  }
  console.log('   거래처별 TOP:')
  ;[...vatByVendor.entries()]
    .sort((a, b) => b[1].net - a[1].net)
    .slice(0, 12)
    .forEach(([name, v]) => {
      console.log(
        `     ${name}: ${v.count}건 | net ${round2(v.net).toLocaleString()} | vat ${round2(v.vat).toLocaleString()}${v.pending ? ` (증빙미완 ${round2(v.pending).toLocaleString()})` : ''}`
      )
    })

  // stock_logs inbound
  const stockLogs = await fetchAll(
    sb,
    'stock_logs',
    'id,log_type,log_date,location,vendor_target,item_code,item_name,qty,unit_cost,inbound_batch_id',
    (q) =>
      q
        .in('log_type', ['Inbound', 'ForcePush'])
        .gte('log_date', `${START}T00:00:00`)
        .lte('log_date', `${END}T23:59:59.999`)
  )
  const stockInbound = stockLogs.filter((r) => matchesStore(r.location))
  const stockHq = stockInbound.filter((r) => ['From HQ', 'HQ'].includes(String(r.vendor_target || '').trim()))
  const stockExternal = stockInbound.filter((r) => !['From HQ', 'HQ'].includes(String(r.vendor_target || '').trim()))

  let items = []
  try {
    items = await fetchAll(sb, 'items', 'code,cost,tax_type', (q) => q.limit(15000))
  } catch {
    items = await fetchAll(sb, 'items', 'code,cost', (q) => q.limit(15000))
  }
  const itemMap = Object.fromEntries(
    (items || []).map((it) => {
      const taxRaw = String(it.tax_type || '').toLowerCase()
      const rate = taxRaw === 'exempt' || taxRaw === 'zero' ? 0 : 0.07
      return [String(it.code || '').trim(), { cost: Number(it.cost) || 0, rate }]
    })
  )

  let extNet = 0
  let extVat = 0
  const extByVendor = new Map()
  for (const r of stockExternal) {
    const qty = Math.abs(Number(r.qty) || 0)
    const unit = Number(r.unit_cost) > 0 ? Number(r.unit_cost) : itemMap[String(r.item_code || '').trim()]?.cost || 0
    const net = round2(qty * unit)
    const rate = itemMap[String(r.item_code || '').trim()]?.rate ?? 0.07
    const vat = round2(net * rate)
    extNet += net
    extVat += vat
    const v = String(r.vendor_target || '(미지정)').trim()
    const prev = extByVendor.get(v) || { count: 0, net: 0, vat: 0 }
    prev.count += 1
    prev.net += net
    prev.vat += vat
    extByVendor.set(v, prev)
  }

  let hqNet = 0
  let hqVat = 0
  for (const r of stockHq) {
    const qty = Math.abs(Number(r.qty) || 0)
    const unit = Number(r.unit_cost) > 0 ? Number(r.unit_cost) : itemMap[String(r.item_code || '').trim()]?.cost || 0
    const net = round2(qty * unit)
    const rate = itemMap[String(r.item_code || '').trim()]?.rate ?? 0.07
    hqNet += net
    hqVat += round2(net * rate)
  }

  const stockLogIdsInPp30 = new Set()
  for (const r of vatBySource.stock) {
    const m = String(r.memo || '').match(/\[AUTO:STOCK_LOG:(\d+)\]/)
    if (m) stockLogIdsInPp30.add(Number(m[1]))
  }
  const hqInPp30 = stockHq.filter((r) => stockLogIdsInPp30.has(Number(r.id)))
  const hqNotInPp30 = stockHq.filter((r) => !stockLogIdsInPp30.has(Number(r.id)))

  console.log('\n3) stock_logs 입고 (PP30 후보 소스)')
  console.log(`   From HQ: ${stockHq.length}건 | 추정 net ${round2(hqNet).toLocaleString()} | vat ${round2(hqVat).toLocaleString()}`)
  console.log(`     → PP30 반영 ${hqInPp30.length}건 | 미반영 ${hqNotInPp30.length}건 (본사 출고 짝 없으면 제외)`)
  console.log(`   외부매입처: ${stockExternal.length}건 | 추정 net ${round2(extNet).toLocaleString()} | vat ${round2(extVat).toLocaleString()}`)
  if (extByVendor.size) {
    console.log('   외부 거래처별:')
    ;[...extByVendor.entries()]
      .sort((a, b) => b[1].net - a[1].net)
      .forEach(([name, v]) => {
        console.log(`     ${name}: ${v.count}건 | net ${round2(v.net).toLocaleString()} | vat ${round2(v.vat).toLocaleString()}`)
      })
  }

  function isPurchasePaymentBankRow(bt) {
    const tt = String(bt.trans_type || '').toLowerCase()
    if (tt !== 'withdraw') return false
    const amt = Number(bt.amount || 0)
    if (amt >= 0) return false
    const cat = String(bt.category || '').toLowerCase()
    if (cat === 'purchase_payment') return true
    return parseCategory(bt.note) === 'purchase_payment'
  }

  // bank purchase payments — 입고관리와 동일: payable_transactions + bank_accounts.store
  const { data: ptRows } = await sb
    .from('payable_transactions')
    .select('bank_transaction_id,vendor_code,trans_date')
    .eq('ref_type', 'Payment')
    .not('bank_transaction_id', 'is', null)
    .gte('trans_date', START)
    .lte('trans_date', END)
    .limit(2000)

  const bankIds = [...new Set((ptRows || []).map((r) => Number(r.bank_transaction_id)).filter((id) => id > 0))]
  let bankRowsByPayable = []
  if (bankIds.length) {
    const { data } = await sb
      .from('bank_transactions')
      .select('id,account_id,trans_date,trans_type,amount,category,note,vendor_code,store_name,invoice_received,invoice_no,memo')
      .in('id', bankIds.slice(0, 500))
    bankRowsByPayable = data || []
  }
  const bankById = Object.fromEntries(bankRowsByPayable.map((b) => [Number(b.id), b]))

  const accountIds = [...new Set(bankRowsByPayable.map((b) => Number(b.account_id)).filter((id) => id > 0))]
  const accountById = {}
  if (accountIds.length) {
    const { data: accRows } = await sb.from('bank_accounts').select('id,store').in('id', accountIds)
    for (const a of accRows || []) accountById[Number(a.id)] = String(a.store || '').trim()
  }

  const { data: inboundLinks } = bankIds.length
    ? await sb
        .from('bank_transaction_inbound_links')
        .select('bank_transaction_id,amount')
        .in('bank_transaction_id', bankIds.slice(0, 500))
    : { data: [] }
  const linkedAmountByBankId = new Map()
  for (const row of inboundLinks || []) {
    const bankId = Number(row.bank_transaction_id || 0)
    if (!bankId) continue
    const amount = Math.abs(Number(row.amount || 0))
    if (amount <= 0) continue
    linkedAmountByBankId.set(bankId, (linkedAmountByBankId.get(bankId) || 0) + amount)
  }

  const bankPurchase = []
  const seenBank = new Set()
  for (const pt of ptRows || []) {
    const bid = Number(pt.bank_transaction_id)
    if (!bid || seenBank.has(bid)) continue
    const bt = bankById[bid]
    if (!bt || !isPurchasePaymentBankRow(bt)) continue
    const accStore = accountById[Number(bt.account_id)] || ''
    const btStore = String(bt.store_name || '').trim()
    if (!matchesStore(accStore) && !matchesStore(btStore)) continue
    if ((linkedAmountByBankId.get(bid) || 0) > 0) continue
    seenBank.add(bid)
    bankPurchase.push({ ...bt, vendor_code: bt.vendor_code || pt.vendor_code, _accStore: accStore })
  }

  const bankTx = await fetchAll(
    sb,
    'bank_transactions',
    'id,trans_date,trans_type,amount,category,note,vendor_code,store_name,invoice_received,invoice_no,memo,account_id',
    (q) => q.gte('trans_date', START).lte('trans_date', END)
  )
  const bankScoped = bankTx.filter((r) => {
    const accStore = accountById[Number(r.account_id)] || ''
    return matchesStore(r.store_name) || matchesStore(accStore)
  })

  const bankExpenseInv = bankScoped.filter((r) => {
    const tt = String(r.trans_type || '').toLowerCase()
    if (tt !== 'withdraw') return false
    if (!r.invoice_received) return false
    const cat = String(r.category || '').toLowerCase()
    const noteCat = parseCategory(r.note)
    return cat !== 'purchase_payment' && noteCat !== 'purchase_payment' && noteCat !== 'purchase_advance'
  })

  const bankPurchaseTotal = sum(
    bankPurchase.map((r) => ({ amount: Math.abs(Number(r.amount) || 0) })),
    'amount'
  )

  const bankPurchaseByVendor = new Map()
  for (const r of bankPurchase) {
    const vc = String(r.vendor_code || '').trim() || '(코드없음)'
    const prev = bankPurchaseByVendor.get(vc) || { count: 0, amount: 0, invoiceOk: 0 }
    prev.count += 1
    prev.amount += Math.abs(Number(r.amount) || 0)
    if (r.invoice_received) prev.invoiceOk += 1
    bankPurchaseByVendor.set(vc, prev)
  }

  console.log('\n4) 통장 — 매입대금(purchase_payment) [입고관리 통장매입 보조행]')
  console.log(`   ${bankPurchase.length}건 | 지급합계 ${bankPurchaseTotal.toLocaleString()} | PP30 자동반영 제외(의도)`)
  console.log('   거래처별:')
  const vendorCodes = [...bankPurchaseByVendor.keys()].filter((c) => c !== '(코드없음)')
  let vendorNames = {}
  if (vendorCodes.length) {
    const { data: vendors } = await sb.from('vendors').select('code,name').in('code', vendorCodes.slice(0, 200))
    vendorNames = Object.fromEntries((vendors || []).map((v) => [v.code, v.name]))
  }
  ;[...bankPurchaseByVendor.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .forEach(([code, v]) => {
      const label = code === '(코드없음)' ? code : `${vendorNames[code] || code} (${code})`
      console.log(
        `     ${label}: ${v.count}건 | ${round2(v.amount).toLocaleString()} | 세금계산서수령 ${v.invoiceOk}/${v.count}`
      )
    })

  console.log('\n5) 통장 — 세금계산서 수령(매입대금 제외, PP30 후보)')
  console.log(`   ${bankExpenseInv.length}건 | 지급합계 ${sum(bankExpenseInv.map((r) => ({ amount: Math.abs(Number(r.amount) || 0) })), 'amount').toLocaleString()}`)
  const bankInvInVat = bankExpenseInv.filter((r) =>
    vatAll.some((v) => String(v.memo || '').includes(`[AUTO:BANK_TX:${r.id}]`))
  )
  const bankInvMissing = bankExpenseInv.filter(
    (r) => !vatAll.some((v) => String(v.memo || '').includes(`[AUTO:BANK_TX:${r.id}]`))
  )
  console.log(`   PP30 반영됨: ${bankInvInVat.length}건 | 미반영: ${bankInvMissing.length}건`)
  if (bankInvMissing.length) {
    console.log('   미반영 목록:')
    bankInvMissing.slice(0, 15).forEach((r) => {
      console.log(
        `     id=${r.id} ${String(r.trans_date || '').slice(0, 10)} | ${Math.abs(Number(r.amount) || 0).toLocaleString()} | ${String(r.memo || '').slice(0, 40)}`
      )
    })
  }

  // expense accruals
  const expenses = await fetchAll(
    sb,
    'expense_accruals',
    'id,status,payee_code,payee_name,amount,vat_amount,expense_date,store_name,invoice_received,invoice_no',
    (q) => q.gte('expense_date', START).lte('expense_date', END).gt('vat_amount', 0)
  )
  const expScoped = expenses.filter((r) => {
    const st = String(r.status || '').toLowerCase()
    if (st === 'rejected') return false
    return matchesStore(r.store_name)
  })
  const expSkippedPurchase = expScoped.filter((r) => {
    const raw = String(r.payee_code || '')
    const idx = raw.lastIndexOf('::wm::')
    const cat = idx >= 0 ? raw.slice(idx + 6).trim().toLowerCase() : 'expense'
    return cat === 'purchase_payment' || cat === 'purchase_advance'
  })
  const expEligible = expScoped.filter((r) => !expSkippedPurchase.includes(r))

  const expInVat = expEligible.filter((r) =>
    vatAll.some((v) => String(v.memo || '').includes(`[AUTO:EXPENSE_ACCRUAL:${r.id}]`))
  )
  const expMissing = expEligible.filter(
    (r) => !vatAll.some((v) => String(v.memo || '').includes(`[AUTO:EXPENSE_ACCRUAL:${r.id}]`))
  )

  console.log('\n6) 지출발생 (vat_amount > 0)')
  console.log(
    `   전체 ${expScoped.length}건 | VAT합 ${sum(expScoped, 'vat_amount').toLocaleString()} | 매입대금류 제외 ${expSkippedPurchase.length}건`
  )
  console.log(`   PP30 후보 ${expEligible.length}건 | 반영 ${expInVat.length} | 미반영 ${expMissing.length}`)
  if (expMissing.length) {
    console.log('   미반영 목록:')
    expMissing.slice(0, 15).forEach((r) => {
      console.log(
        `     id=${r.id} ${String(r.expense_date || '').slice(0, 10)} | ${String(r.payee_name || '').slice(0, 30)} | gross ${Number(r.amount || 0).toLocaleString()} vat ${Number(r.vat_amount || 0).toLocaleString()} | inv=${r.invoice_received ? 'Y' : 'N'}`
      )
    })
  }

  // petty cash
  const petty = await fetchAll(
    sb,
    'petty_cash_transactions',
    'id,trans_type,trans_date,amount,vat_amount,store,invoice_received,vendor_code,memo',
    (q) => q.eq('trans_type', 'expense').gte('trans_date', START).lte('trans_date', END)
  )
  const pettyScoped = petty.filter((r) => matchesStore(r.store))
  const pettyWithVat = pettyScoped.filter((r) => Number(r.vat_amount) > 0 || r.invoice_received)
  const pettyInVat = pettyWithVat.filter((r) =>
    vatAll.some((v) => String(v.memo || '').includes(`[AUTO:PETTY_CASH:${r.id}]`))
  )
  const pettyMissing = pettyWithVat.filter(
    (r) => !vatAll.some((v) => String(v.memo || '').includes(`[AUTO:PETTY_CASH:${r.id}]`))
  )

  console.log('\n7) 시재 지출 (VAT 또는 세금계산서)')
  console.log(`   후보 ${pettyWithVat.length}건 | PP30 반영 ${pettyInVat.length} | 미반영 ${pettyMissing.length}`)
  if (pettyMissing.length) {
    pettyMissing.slice(0, 10).forEach((r) => {
      console.log(
        `     id=${r.id} ${r.trans_date} | ${Math.abs(Number(r.amount) || 0).toLocaleString()} vat=${Number(r.vat_amount || 0)} inv=${r.invoice_received ? 'Y' : 'N'}`
      )
    })
  }

  // Gap summary
  const pp30Net = sum(vatInput, 'net_amount')
  const pp30Vat = sum(vatInput, 'vat_amount')
  const stockInboundTotal = round2(hqNet + extNet)
  const inboundUiTotal = round2(stockInboundTotal + bankPurchaseTotal)
  const gapPaymentOnly = round2(bankPurchaseTotal)
  const gapExtInboundNotInPp30 = round2(extNet - sum(vatBySource.stock.filter((r) => !['From HQ', 'HQ'].includes(String(r.counterparty_name || '').trim())), 'net_amount'))

  console.log('\n=== 갭 요약 ===')
  console.log(`입고관리 유사 합계(품목입고 ${stockInboundTotal.toLocaleString()} + 통장매입지급 ${bankPurchaseTotal.toLocaleString()}): ~${inboundUiTotal.toLocaleString()}`)
  console.log(`PP30 매입 공급가: ${pp30Net.toLocaleString()} | VAT: ${pp30Vat.toLocaleString()}`)
  console.log(`통장 매입대금만( PP30 제외 ): ${gapPaymentOnly.toLocaleString()} — 품목입고/지출VAT 없으면 PP30 누락처럼 보임`)
  console.log(`외부 입고 추정 vs PP30 stock 소스: 외부입고 net ${round2(extNet).toLocaleString()} (PP30에 From HQ 외 거래처만 있으면 대부분 미반영)`)
  console.log(`지출발생 VAT 미반영: ${expMissing.length}건`)
  console.log(`통장 세금계산서(비매입대금) 미반영: ${bankInvMissing.length}건`)
  console.log(`시재 VAT 미반영: ${pettyMissing.length}건`)
  console.log('\n권장: 세무신고 → 매입 백필(2026-05) 실행 후 위 미반영 건 수동 점검\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
