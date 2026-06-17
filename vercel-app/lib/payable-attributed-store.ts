import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { parsePurchaseOrderCart } from '@/lib/purchase-order-cart'

const PAYABLE_LEDGER_SELECT =
  'id,vendor_code,amount,ref_type,ref_id,trans_date,memo,bank_transaction_id,expense_accrual_id,petty_cash_transaction_id'

export type PayableTransactionRow = {
  id?: number
  vendor_code?: string
  amount?: number
  ref_type?: string
  ref_id?: number
  trans_date?: string
  memo?: string
  created_at?: string
  bank_transaction_id?: number | null
  expense_accrual_id?: number | null
  petty_cash_transaction_id?: number | null
}

export type PayableAttributionMaps = {
  locationByInboundId: Map<number, string>
  storeByPoId: Map<number, string>
  storeByAccrualId: Map<number, string>
  storeByPettyId: Map<number, string>
  storeByBankId: Map<number, string>
  /** 같은 거래처·거래일 PO/입고 발생 매장 — 매입 지급(Payment) 귀속 보조 */
  accrualStoreByVendorDate: Map<string, string>
  /** 같은 거래처·금액 PO/입고 발생 매장 — 지급일≠발생일 폴백 */
  accrualStoreByVendorAmount: Map<string, string>
}

function vendorDateStoreKey(vendorCode: string, transDate: string): string {
  const vc = String(vendorCode || '').trim().toLowerCase()
  const dt = String(transDate || '').trim().slice(0, 10)
  return `${vc}|${dt}`
}

function isPurchasePaymentRow(r: PayableTransactionRow): boolean {
  if (String(r.ref_type || '') === 'Payment') return true
  if (r.expense_accrual_id != null && Number(r.expense_accrual_id) > 0) return false
  if (r.bank_transaction_id != null && Number(r.bank_transaction_id) > 0) {
    return Number(r.amount ?? 0) < 0
  }
  return false
}

/** 미지급금(매입) 원장 — PO·입고·매입 지급만. 급여·지출발생(expense_accrual) 제외 */
export function isPurchasePayableLedgerRow(r: PayableTransactionRow): boolean {
  const refType = String(r.ref_type || '').trim()
  if (refType === 'Expense' || refType === 'InteriorExpense') return false
  if (r.expense_accrual_id != null && Number(r.expense_accrual_id) > 0) return false
  if (refType === 'Opening' || refType === 'PO' || refType === 'Inbound') return true
  if (refType === 'Payment') return true
  return isPurchasePaymentRow(r)
}

export function filterPurchasePayableLedgerRows(rows: PayableTransactionRow[]): PayableTransactionRow[] {
  return rows.filter(isPurchasePayableLedgerRow)
}

function vendorAmountStoreKey(vendorCode: string, amountAbs: number): string {
  const vc = String(vendorCode || '').trim().toLowerCase()
  return `${vc}|${roundMoney(Math.abs(amountAbs))}`
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function buildPayableAccrualStoreIndexes(
  rows: PayableTransactionRow[],
  maps: Pick<PayableAttributionMaps, 'locationByInboundId' | 'storeByPoId'>
): Pick<PayableAttributionMaps, 'accrualStoreByVendorDate' | 'accrualStoreByVendorAmount'> {
  const accrualStoreByVendorDate = new Map<string, string>()
  const accrualStoreByVendorAmount = new Map<string, string>()
  for (const r of rows || []) {
    let store: string | null = null
    if (r.ref_type === 'PO' && r.ref_id != null) {
      store = maps.storeByPoId.get(Number(r.ref_id)) || null
    } else if (r.ref_type === 'Inbound' && r.ref_id != null) {
      store = maps.locationByInboundId.get(Number(r.ref_id)) || null
    }
    if (!store) continue
    const vc = String(r.vendor_code || '').trim().toLowerCase()
    const dt = String(r.trans_date || '').trim().slice(0, 10)
    const amountAbs = Math.abs(Number(r.amount ?? 0))
    if (!vc || dt.length !== 10) continue
    accrualStoreByVendorDate.set(`${vc}|${dt}`, store)
    if (amountAbs > 0) {
      accrualStoreByVendorAmount.set(vendorAmountStoreKey(vc, amountAbs), store)
    }
  }
  return { accrualStoreByVendorDate, accrualStoreByVendorAmount }
}

/** @deprecated use buildPayableAccrualStoreIndexes */
export function buildAccrualStoreByVendorDate(
  rows: PayableTransactionRow[],
  maps: Pick<PayableAttributionMaps, 'locationByInboundId' | 'storeByPoId'>
): Map<string, string> {
  return buildPayableAccrualStoreIndexes(rows, maps).accrualStoreByVendorDate
}

export function matchesPayableStoreNorm(resolved: string | null | undefined, storeFilter: string): boolean {
  const f = storeFilter.trim().toLowerCase()
  if (!f || f === 'all' || f === '전체') return true
  const r = String(resolved || '').trim().toLowerCase()
  if (!r) return false
  return r === f || r.includes(f) || f.includes(r)
}

export function isPayableStoreFilterActive(storeFilter: string | undefined | null): boolean {
  const s = String(storeFilter || '').trim()
  if (!s) return false
  const lower = s.toLowerCase()
  return lower !== 'all' && lower !== '전체'
}

function poAttributedStore(po: { location_name?: string; cart_json?: string }): string | null {
  const { meta, items } = parsePurchaseOrderCart(po.cart_json)
  const rel = String(meta?.relatedStore || '').trim()
  if (rel) return rel
  const lineStore = items.map((i) => String(i.store || '').trim()).find(Boolean)
  if (lineStore) return lineStore
  const loc = String(po.location_name || '').trim()
  return loc || null
}

export function resolvePayableAttributedStore(
  r: PayableTransactionRow,
  maps: PayableAttributionMaps
): string | null {
  if (r.ref_type === 'Inbound' && r.ref_id != null) {
    return maps.locationByInboundId.get(Number(r.ref_id)) || null
  }
  if (r.ref_type === 'PO' && r.ref_id != null) {
    return maps.storeByPoId.get(Number(r.ref_id)) || null
  }
  if (r.expense_accrual_id != null && Number(r.expense_accrual_id) > 0) {
    return maps.storeByAccrualId.get(Number(r.expense_accrual_id)) || null
  }
  if (r.petty_cash_transaction_id != null && Number(r.petty_cash_transaction_id) > 0) {
    return maps.storeByPettyId.get(Number(r.petty_cash_transaction_id)) || null
  }
  if (isPurchasePaymentRow(r)) {
    const vc = String(r.vendor_code || '').trim().toLowerCase()
    const dt = String(r.trans_date || '').trim().slice(0, 10)
    const amountAbs = Math.abs(Number(r.amount ?? 0))
    const byDate = maps.accrualStoreByVendorDate.get(vendorDateStoreKey(vc, dt))
    if (byDate) return byDate
    if (amountAbs > 0) {
      const byAmount = maps.accrualStoreByVendorAmount.get(vendorAmountStoreKey(vc, amountAbs))
      if (byAmount) return byAmount
    }
  }
  if (r.bank_transaction_id != null && Number(r.bank_transaction_id) > 0) {
    return maps.storeByBankId.get(Number(r.bank_transaction_id)) || null
  }
  return null
}

export async function buildPayableAttributionMaps(rows: PayableTransactionRow[]): Promise<PayableAttributionMaps> {
  const inboundIdsAll = [
    ...new Set((rows || []).filter((r) => r.ref_type === 'Inbound' && r.ref_id != null).map((r) => Number(r.ref_id))),
  ]
  const locationByInboundId = new Map<number, string>()
  if (inboundIdsAll.length > 0) {
    const batches = (await supabaseSelectFilter('inbound_batches', `id=in.(${inboundIdsAll.join(',')})`, {
      select: 'id,location',
      limit: 10000,
    })) as { id?: number; location?: string }[] | null
    for (const b of batches || []) {
      if (b.id != null) locationByInboundId.set(Number(b.id), String(b.location || '').trim())
    }
  }

  const poIdsAll = [
    ...new Set((rows || []).filter((r) => r.ref_type === 'PO' && r.ref_id != null).map((r) => Number(r.ref_id))),
  ]
  const storeByPoId = new Map<number, string>()
  if (poIdsAll.length > 0) {
    const pos = (await supabaseSelectFilter('purchase_orders', `id=in.(${poIdsAll.join(',')})`, {
      select: 'id,location_name,cart_json',
      limit: 5000,
    })) as { id?: number; location_name?: string; cart_json?: string }[] | null
    for (const p of pos || []) {
      if (p.id == null) continue
      const s = poAttributedStore(p)
      if (s) storeByPoId.set(Number(p.id), s)
    }
  }

  const eids = [
    ...new Set(
      (rows || [])
        .filter((r) => r.expense_accrual_id != null && Number(r.expense_accrual_id) > 0)
        .map((r) => Number(r.expense_accrual_id))
    ),
  ]
  const storeByAccrualId = new Map<number, string>()
  if (eids.length > 0) {
    const accr = (await supabaseSelectFilter('expense_accruals', `id=in.(${eids.join(',')})`, {
      select: 'id,store_name',
      limit: 10000,
    })) as { id?: number; store_name?: string | null }[] | null
    for (const a of accr || []) {
      if (a.id == null) continue
      const sn = String(a.store_name || '').trim()
      if (sn) storeByAccrualId.set(Number(a.id), sn)
    }
  }

  const pettyIds = [
    ...new Set(
      (rows || [])
        .filter((r) => r.petty_cash_transaction_id != null && Number(r.petty_cash_transaction_id) > 0)
        .map((r) => Number(r.petty_cash_transaction_id))
    ),
  ]
  const storeByPettyId = new Map<number, string>()
  if (pettyIds.length > 0) {
    const petty = (await supabaseSelectFilter('petty_cash_transactions', `id=in.(${pettyIds.join(',')})`, {
      select: 'id,store',
      limit: 10000,
    })) as { id?: number; store?: string | null }[] | null
    for (const p of petty || []) {
      if (p.id == null) continue
      const st = String(p.store || '').trim()
      if (st) storeByPettyId.set(Number(p.id), st)
    }
  }

  const bankIdsAll = [
    ...new Set(
      (rows || [])
        .filter((r) => r.bank_transaction_id != null && Number(r.bank_transaction_id) > 0)
        .map((r) => Number(r.bank_transaction_id))
    ),
  ]
  const storeByBankId = new Map<number, string>()
  if (bankIdsAll.length > 0) {
    const banks = (await supabaseSelectFilter('bank_transactions', `id=in.(${bankIdsAll.join(',')})`, {
      select: 'id,store',
      limit: 5000,
    })) as { id?: number; store?: string | null }[] | null
    for (const bt of banks || []) {
      if (bt.id == null) continue
      const st = String(bt.store || '').trim()
      if (st) storeByBankId.set(Number(bt.id), st)
    }
  }

  const { accrualStoreByVendorDate, accrualStoreByVendorAmount } = buildPayableAccrualStoreIndexes(rows, {
    locationByInboundId,
    storeByPoId,
  })

  return {
    locationByInboundId,
    storeByPoId,
    storeByAccrualId,
    storeByPettyId,
    storeByBankId,
    accrualStoreByVendorDate,
    accrualStoreByVendorAmount,
  }
}

export async function loadPayableTransactionsToEnd(params: {
  vendorFilter?: string
  endStr: string
}): Promise<PayableTransactionRow[]> {
  const parts: string[] = []
  if (params.vendorFilter) parts.push(`vendor_code=ilike.${encodeURIComponent(params.vendorFilter)}`)
  if (params.endStr) parts.push(`trans_date=lte.${params.endStr}`)
  const filter = parts.length ? parts.join('&') : 'id=gt.0'
  return (await supabaseSelectFilterAllPages('payable_transactions', filter, {
    select: PAYABLE_LEDGER_SELECT,
    pageSize: 8000,
    maxRows: 2_000_000,
  })) as PayableTransactionRow[]
}

export async function scopePayableLedgerRows(
  rows: PayableTransactionRow[],
  storeFilter?: string
): Promise<{ maps: PayableAttributionMaps; scopedRows: PayableTransactionRow[] }> {
  const maps = await buildPayableAttributionMaps(rows)
  const scopedRows = isPayableStoreFilterActive(storeFilter)
    ? filterPayableRowsByStore(rows, storeFilter!, maps)
    : rows
  return { maps, scopedRows }
}

export function payableRowsOnOrAfterStart(
  rows: PayableTransactionRow[],
  startStr: string | undefined
): PayableTransactionRow[] {
  if (!startStr) return rows
  return rows.filter((r) => String(r.trans_date || '').slice(0, 10) >= startStr)
}

export function cumulativeBalanceByVendor(rows: PayableTransactionRow[]): Record<string, number> {
  const byVendor: Record<string, number> = {}
  for (const r of rows) {
    const vc = String(r.vendor_code || '').trim()
    if (!vc) continue
    byVendor[vc] = (byVendor[vc] || 0) + Number(r.amount ?? 0)
  }
  return byVendor
}

const LEDGER_BALANCE_EPS = 0.01

export function buildPayableListWithCumulative(params: {
  cumulativeByVendor: Record<string, number>
  periodByVendor: Record<string, { total: number; items: PayableTransactionRow[] }>
}): {
  vendorCode: string
  balance: number
  cumulativeBalance: number
  items: PayableTransactionRow[]
}[] {
  const { cumulativeByVendor, periodByVendor } = params
  const vendorCodes = new Set<string>([
    ...Object.keys(cumulativeByVendor).filter((vc) => Math.abs(cumulativeByVendor[vc] ?? 0) > LEDGER_BALANCE_EPS),
    ...Object.keys(periodByVendor),
  ])
  return Array.from(vendorCodes)
    .map((vendorCode) => ({
      vendorCode,
      balance: periodByVendor[vendorCode]?.total ?? 0,
      cumulativeBalance: cumulativeByVendor[vendorCode] ?? 0,
      items: (periodByVendor[vendorCode]?.items ?? []).sort((a, b) =>
        String(b.trans_date || '').localeCompare(String(a.trans_date || ''))
      ),
    }))
    .sort((a, b) => Math.abs(b.cumulativeBalance) - Math.abs(a.cumulativeBalance))
}

export function filterPayableRowsByStore(
  rows: PayableTransactionRow[],
  storeFilter: string,
  maps: PayableAttributionMaps
): PayableTransactionRow[] {
  if (!isPayableStoreFilterActive(storeFilter)) return rows
  return rows.filter((r) => matchesPayableStoreNorm(resolvePayableAttributedStore(r, maps), storeFilter))
}

export function aggregatePayableBalancesByVendor(
  rows: PayableTransactionRow[]
): { vendorCode: string; balance: number; count: number }[] {
  const byVendor: Record<string, { balance: number; count: number }> = {}
  for (const r of rows) {
    const vc = String(r.vendor_code || '').trim()
    if (!vc) continue
    if (!byVendor[vc]) byVendor[vc] = { balance: 0, count: 0 }
    byVendor[vc].balance += Number(r.amount ?? 0)
    byVendor[vc].count += 1
  }
  return Object.entries(byVendor)
    .map(([vendorCode, v]) => ({ vendorCode, balance: v.balance, count: v.count }))
    .sort((a, b) => b.balance - a.balance)
}
