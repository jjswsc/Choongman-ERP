import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { parsePurchaseOrderCart } from '@/lib/purchase-order-cart'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStore } from '@/lib/permissions'
import { INBOUND_HQ_LOCATION } from '@/lib/stock-location-patterns'
import { ensureErpStoreMatchIndex } from '@/lib/accounting-store-match'
import type { ErpStoreMatchIndex } from '@/lib/erp-store-identity'
import { matchesAccountingStoreScopeRow } from '@/lib/accounting-store-row-match'

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
  /** 통장 출금 ↔ 입고 연동 — bank_transaction_id → 대표 귀속 매장 */
  storeByBankInboundLink: Map<number, string>
  /** 통장 출금 ↔ 입고 연동 — bank_transaction_id → 연동된 모든 귀속 매장 */
  storesByBankInboundLink: Map<number, Set<string>>
}

function vendorDateStoreKey(vendorCode: string, transDate: string): string {
  const vc = String(vendorCode || '').trim().toLowerCase()
  const dt = String(transDate || '').trim().slice(0, 10)
  return `${vc}|${dt}`
}

function decodePayeeWithdrawalCategory(payeeCode: string | undefined | null): string {
  const src = String(payeeCode || '').trim()
  const marker = '::wm::'
  const idx = src.lastIndexOf(marker)
  if (idx < 0) return 'expense'
  return src.slice(idx + marker.length).trim().toLowerCase() || 'expense'
}

export function isPurchaseWithdrawalCategory(category: string): boolean {
  const c = String(category || '').trim().toLowerCase()
  return c === 'purchase_payment' || c === 'purchase_advance'
}

function isPurchasePaymentRow(r: PayableTransactionRow): boolean {
  if (String(r.ref_type || '') === 'Payment') return true
  if (r.expense_accrual_id != null && Number(r.expense_accrual_id) > 0) return false
  if (r.bank_transaction_id != null && Number(r.bank_transaction_id) > 0) {
    return Number(r.amount ?? 0) < 0
  }
  return false
}

export type PurchasePayableLedgerFilterOptions = {
  /** 지급예정(expense_accrual) 중 매입대금·매입선급 카테고리 id — filterPurchasePayableLedgerRowsAsync 로 채움 */
  purchaseAccrualIds?: Set<number>
}

/**
 * 미지급금(매입) 원장 — 입고·매입 지급·기초이월만.
 * - 발주(PO)는 제외: 매입채무는 입고(검수 완료) 기준으로 확정한다(회계 규칙). 발주 미지급 행이 입고와
 *   같이 남으면 이중 계상되므로, 발주는 미지급금에 넣지 않는다(발주 예정은 발주 관리에서 확인).
 * - 일반 경비·급여 지출발생(expense_accrual)은 제외. 매입대금 지급예정 경유 Payment 는 포함.
 */
export function isPurchasePayableLedgerRow(
  r: PayableTransactionRow,
  options?: PurchasePayableLedgerFilterOptions
): boolean {
  const refType = String(r.ref_type || '').trim()
  if (refType === 'Expense' || refType === 'InteriorExpense') return false
  if (refType === 'PO') return false

  const accrualId = r.expense_accrual_id != null ? Number(r.expense_accrual_id) : 0

  if (refType === 'Payment') {
    if (accrualId <= 0) return true
    return options?.purchaseAccrualIds?.has(accrualId) ?? false
  }

  if (accrualId > 0) return false
  if (refType === 'Opening' || refType === 'Inbound') return true
  return isPurchasePaymentRow(r)
}

export async function loadPurchasePaymentAccrualIds(accrualIds: number[]): Promise<Set<number>> {
  const unique = [...new Set(accrualIds.filter((id) => id > 0))]
  if (!unique.length) return new Set()

  const out = new Set<number>()
  const chunkSize = 200
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const rows = (await supabaseSelectFilter('expense_accruals', `id=in.(${chunk.join(',')})`, {
      select: 'id,payee_code',
      limit: chunk.length,
    })) as { id?: number; payee_code?: string | null }[] | null
    for (const row of rows || []) {
      const id = Number(row.id || 0)
      if (!id) continue
      if (isPurchaseWithdrawalCategory(decodePayeeWithdrawalCategory(row.payee_code))) {
        out.add(id)
      }
    }
  }
  return out
}

export async function filterPurchasePayableLedgerRowsAsync(
  rows: PayableTransactionRow[]
): Promise<PayableTransactionRow[]> {
  const accrualIds = rows
    .filter((r) => String(r.ref_type || '') === 'Payment' && Number(r.expense_accrual_id || 0) > 0)
    .map((r) => Number(r.expense_accrual_id))
  const purchaseAccrualIds = await loadPurchasePaymentAccrualIds(accrualIds)
  return rows.filter((r) => isPurchasePayableLedgerRow(r, { purchaseAccrualIds }))
}

/** @deprecated 동기 필터 — 지급예정 매입 지급은 누락될 수 있음. API는 filterPurchasePayableLedgerRowsAsync 사용 */
export function filterPurchasePayableLedgerRows(rows: PayableTransactionRow[]): PayableTransactionRow[] {
  return rows.filter((r) => isPurchasePayableLedgerRow(r))
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

function isPayableOfficeLocation(store: string): boolean {
  const t = String(store || '').trim()
  if (!t) return false
  return t === INBOUND_HQ_LOCATION || isOfficeStore(t) || isHeadOfficeLikeStoreName(t)
}

export function matchesPayableStoreNorm(
  resolved: string | null | undefined,
  storeFilter: string,
  index?: ErpStoreMatchIndex
): boolean {
  const f = storeFilter.trim()
  if (!f || f.toLowerCase() === 'all' || f === '전체') return true
  const r = String(resolved || '').trim()
  if (!r) return false
  if (index) {
    return matchesAccountingStoreScopeRow(r, f, index.masters, index.legacyToCanonical)
  }
  if (isPayableOfficeLocation(f) && isPayableOfficeLocation(r)) return true
  return storesMatchForGradeLookup(r, f)
}

function paymentLinkedStores(
  r: PayableTransactionRow,
  maps: PayableAttributionMaps
): Set<string> | null {
  const bankId = r.bank_transaction_id != null ? Number(r.bank_transaction_id) : 0
  if (!bankId) return null
  const linked = maps.storesByBankInboundLink.get(bankId)
  return linked && linked.size > 0 ? linked : null
}

function rowMatchesPayableStoreFilter(
  r: PayableTransactionRow,
  storeFilter: string,
  maps: PayableAttributionMaps,
  index?: ErpStoreMatchIndex
): boolean {
  if (isPurchasePaymentRow(r)) {
    const linked = paymentLinkedStores(r, maps)
    if (linked) {
      for (const store of linked) {
        if (matchesPayableStoreNorm(store, storeFilter, index)) return true
      }
      return false
    }
  }
  const attributed = resolvePayableAttributedStore(r, maps)
  return matchesPayableStoreNorm(attributed, storeFilter, index)
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
    const bankId = r.bank_transaction_id != null ? Number(r.bank_transaction_id) : 0
    if (bankId > 0) {
      const linked = maps.storeByBankInboundLink.get(bankId)
      if (linked) return linked
    }
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
    const bankStore = maps.storeByBankId.get(Number(r.bank_transaction_id))
    if (bankStore) return bankStore
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
  const storeByBankInboundLink = new Map<number, string>()
  const storesByBankInboundLink = new Map<number, Set<string>>()
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

    const inboundLinks = (await supabaseSelectFilter(
      'bank_transaction_inbound_links',
      `bank_transaction_id=in.(${bankIdsAll.join(',')})`,
      {
        select: 'bank_transaction_id,inbound_batch_id,amount',
        limit: 10000,
      }
    )) as { bank_transaction_id?: number; inbound_batch_id?: number; amount?: number }[] | null

    const linkWeightByBank = new Map<number, Map<string, number>>()
    for (const link of inboundLinks || []) {
      const bankId = Number(link.bank_transaction_id || 0)
      const batchId = Number(link.inbound_batch_id || 0)
      if (!bankId || !batchId) continue
      const store = locationByInboundId.get(batchId)
      if (!store) continue
      if (!storesByBankInboundLink.has(bankId)) storesByBankInboundLink.set(bankId, new Set())
      storesByBankInboundLink.get(bankId)!.add(store)
      const weight = Math.abs(Number(link.amount ?? 0)) || 1
      if (!linkWeightByBank.has(bankId)) linkWeightByBank.set(bankId, new Map())
      const weights = linkWeightByBank.get(bankId)!
      weights.set(store, (weights.get(store) || 0) + weight)
    }
    for (const [bankId, weights] of linkWeightByBank) {
      let bestStore = ''
      let bestWeight = -1
      for (const [store, weight] of weights) {
        if (weight > bestWeight) {
          bestWeight = weight
          bestStore = store
        }
      }
      if (bestStore) storeByBankInboundLink.set(bankId, bestStore)
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
    storeByBankInboundLink,
    storesByBankInboundLink,
  }
}

/** 동일 입고(ref_id)에 payable이 2행 이상이면 id가 가장 작은 1행만 원장에 반영 */
export function dedupeInboundPayableLedgerRows(rows: PayableTransactionRow[]): PayableTransactionRow[] {
  const bestByInboundRef = new Map<number, PayableTransactionRow>()
  const rest: PayableTransactionRow[] = []

  for (const row of rows) {
    if (String(row.ref_type || '') !== 'Inbound') {
      rest.push(row)
      continue
    }
    const refId = Number(row.ref_id || 0)
    if (!refId) {
      rest.push(row)
      continue
    }
    const prev = bestByInboundRef.get(refId)
    if (!prev) {
      bestByInboundRef.set(refId, row)
      continue
    }
    const prevId = Number(prev.id ?? 0)
    const rowId = Number(row.id ?? 0)
    if (rowId > 0 && (prevId <= 0 || rowId < prevId)) {
      bestByInboundRef.set(refId, row)
    }
  }

  return [...rest, ...bestByInboundRef.values()]
}

export async function loadPayableTransactionsToEnd(params: {
  vendorFilter?: string
  endStr: string
}): Promise<PayableTransactionRow[]> {
  const parts: string[] = []
  if (params.vendorFilter) parts.push(`vendor_code=ilike.${encodeURIComponent(params.vendorFilter)}`)
  if (params.endStr) parts.push(`trans_date=lte.${params.endStr}`)
  const filter = parts.length ? parts.join('&') : 'id=gt.0'
  const rows = (await supabaseSelectFilterAllPages('payable_transactions', filter, {
    select: PAYABLE_LEDGER_SELECT,
    pageSize: 8000,
    maxRows: 2_000_000,
  })) as PayableTransactionRow[]
  return dedupeInboundPayableLedgerRows(rows)
}

export async function scopePayableLedgerRows(
  rows: PayableTransactionRow[],
  storeFilter?: string
): Promise<{ maps: PayableAttributionMaps; scopedRows: PayableTransactionRow[] }> {
  const maps = await buildPayableAttributionMaps(rows)
  const index = await ensureErpStoreMatchIndex()
  const scopedRows = isPayableStoreFilterActive(storeFilter)
    ? filterPayableRowsByStore(rows, storeFilter!, maps, index)
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
  maps: PayableAttributionMaps,
  index?: ErpStoreMatchIndex
): PayableTransactionRow[] {
  if (!isPayableStoreFilterActive(storeFilter)) return rows

  return rows.filter((r) => rowMatchesPayableStoreFilter(r, storeFilter, maps, index))
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
