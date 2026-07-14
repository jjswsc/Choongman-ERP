import { pickPayablePaymentKeeperId } from '@/lib/receivable-payable'
import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { parsePurchaseOrderCart } from '@/lib/purchase-order-cart'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isOfficeStoreVariant, canonicalOfficeStore } from '@/lib/office-store-canonical'
import { ensureErpStoreMatchIndex } from '@/lib/accounting-store-match'
import type { ErpStoreMatchIndex } from '@/lib/erp-store-identity'
import { matchesAccountingStoreScopeRow } from '@/lib/accounting-store-row-match'
import { rowMatchesInvoiceFilter } from '@/lib/receivable-payable-invoice-filter'

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

export async function loadBankCategoryByIdForPayables(
  rows: PayableTransactionRow[]
): Promise<Map<number, string>> {
  const bankIds = [
    ...new Set(
      (rows || [])
        .filter((r) => r.bank_transaction_id != null && Number(r.bank_transaction_id) > 0)
        .map((r) => Number(r.bank_transaction_id))
    ),
  ]
  const out = new Map<number, string>()
  if (!bankIds.length) return out
  const banks = (await supabaseSelectFilter('bank_transactions', `id=in.(${bankIds.join(',')})`, {
    select: 'id,category',
    limit: 10000,
  })) as { id?: number; category?: string | null }[] | null
  for (const bt of banks || []) {
    if (bt.id == null) continue
    out.set(Number(bt.id), String(bt.category || '').trim().toLowerCase())
  }
  return out
}

/** 일반 경비(expense) 통장 연동 지급은 매입채무 원장에서 제외 */
export function isPurchasePayableLedgerRowWithBankCategory(
  r: PayableTransactionRow,
  options: PurchasePayableLedgerFilterOptions & { bankCategoryById?: Map<number, string> }
): boolean {
  if (!isPurchasePayableLedgerRow(r, options)) return false
  const bankId = Number(r.bank_transaction_id || 0)
  if (!bankId) return true
  const cat = options.bankCategoryById?.get(bankId) || ''
  if (cat !== 'expense') return true
  const accrualId = Number(r.expense_accrual_id || 0)
  return accrualId > 0 && (options.purchaseAccrualIds?.has(accrualId) ?? false)
}

export async function filterPurchasePayableLedgerRowsAsync(
  rows: PayableTransactionRow[]
): Promise<PayableTransactionRow[]> {
  const accrualIds = rows
    .filter((r) => String(r.ref_type || '') === 'Payment' && Number(r.expense_accrual_id || 0) > 0)
    .map((r) => Number(r.expense_accrual_id))
  const purchaseAccrualIds = await loadPurchasePaymentAccrualIds(accrualIds)
  const bankCategoryById = await loadBankCategoryByIdForPayables(rows)
  return rows.filter((r) =>
    isPurchasePayableLedgerRowWithBankCategory(r, { purchaseAccrualIds, bankCategoryById })
  )
}

/** @deprecated 동기 필터 — 지급예정 매입 지급은 누락될 수 있음. API는 filterPurchasePayableLedgerRowsAsync 사용 */
export function filterPurchasePayableLedgerRows(rows: PayableTransactionRow[]): PayableTransactionRow[] {
  return rows.filter((r) => isPurchasePayableLedgerRow(r))
}

function isPayableOfficeLocation(store: string): boolean {
  return isOfficeStoreVariant(store)
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

function rowMatchesPayableStoreFilter(
  r: PayableTransactionRow,
  storeFilter: string,
  maps: PayableAttributionMaps,
  index?: ErpStoreMatchIndex
): boolean {
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

/**
 * 매장 귀속 — 확정 소스만 (거래처·날짜·금액·입고짝짓기 추측 금지).
 * - 입고/PO: 해당 문서 로케이션
 * - Payment: 통장 매장만 (있으면). 없으면 지급예정/시재의 매장
 * - 그 외: 지급예정·시재·통장 순
 */
export function resolvePayableAttributedStore(
  r: PayableTransactionRow,
  maps: PayableAttributionMaps
): string | null {
  let store: string | null = null
  if (r.ref_type === 'Inbound' && r.ref_id != null) {
    store = maps.locationByInboundId.get(Number(r.ref_id)) || null
  } else if (r.ref_type === 'PO' && r.ref_id != null) {
    store = maps.storeByPoId.get(Number(r.ref_id)) || null
  } else if (isPurchasePaymentRow(r)) {
    const bankId = r.bank_transaction_id != null ? Number(r.bank_transaction_id) : 0
    if (bankId > 0) store = maps.storeByBankId.get(bankId) || null
    if (!store && r.expense_accrual_id != null && Number(r.expense_accrual_id) > 0) {
      store = maps.storeByAccrualId.get(Number(r.expense_accrual_id)) || null
    }
    if (!store && r.petty_cash_transaction_id != null && Number(r.petty_cash_transaction_id) > 0) {
      store = maps.storeByPettyId.get(Number(r.petty_cash_transaction_id)) || null
    }
  } else if (r.expense_accrual_id != null && Number(r.expense_accrual_id) > 0) {
    store = maps.storeByAccrualId.get(Number(r.expense_accrual_id)) || null
  } else if (r.petty_cash_transaction_id != null && Number(r.petty_cash_transaction_id) > 0) {
    store = maps.storeByPettyId.get(Number(r.petty_cash_transaction_id)) || null
  } else if (r.bank_transaction_id != null && Number(r.bank_transaction_id) > 0) {
    store = maps.storeByBankId.get(Number(r.bank_transaction_id)) || null
  }
  if (!store) return null
  return canonicalOfficeStore(store)
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
      select: 'id,store,account_id',
      limit: 5000,
    })) as { id?: number; store?: string | null; account_id?: number | null }[] | null
    const missingAccountIds: number[] = []
    for (const bt of banks || []) {
      if (bt.id == null) continue
      const st = String(bt.store || '').trim()
      if (st) {
        storeByBankId.set(Number(bt.id), st)
        continue
      }
      const accountId = Number(bt.account_id || 0)
      if (accountId > 0) missingAccountIds.push(accountId)
    }
    if (missingAccountIds.length > 0) {
      const uniqueAccountIds = [...new Set(missingAccountIds)]
      const accounts = (await supabaseSelectFilter('bank_accounts', `id=in.(${uniqueAccountIds.join(',')})`, {
        select: 'id,store',
        limit: 5000,
      })) as { id?: number; store?: string | null }[] | null
      const storeByAccountId = new Map<number, string>()
      for (const a of accounts || []) {
        if (a.id == null) continue
        const st = String(a.store || '').trim()
        if (st) storeByAccountId.set(Number(a.id), st)
      }
      for (const bt of banks || []) {
        if (bt.id == null || storeByBankId.has(Number(bt.id))) continue
        const accountId = Number(bt.account_id || 0)
        const st = accountId > 0 ? storeByAccountId.get(accountId) : undefined
        if (st) storeByBankId.set(Number(bt.id), st)
      }
    }
  }

  return {
    locationByInboundId,
    storeByPoId,
    storeByAccrualId,
    storeByPettyId,
    storeByBankId,
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

/** 동일 통장 출금(bank_transaction_id)에 Payment 2행 이상이면 지급예정 연동 행 우선 1행만 원장에 반영 */
export function dedupePayablePaymentLedgerRows(rows: PayableTransactionRow[]): PayableTransactionRow[] {
  const byBankId = new Map<number, PayableTransactionRow[]>()
  const rest: PayableTransactionRow[] = []

  for (const row of rows) {
    if (String(row.ref_type || '') !== 'Payment') {
      rest.push(row)
      continue
    }
    const bankId = Number(row.bank_transaction_id || 0)
    if (!bankId) {
      rest.push(row)
      continue
    }
    const bucket = byBankId.get(bankId) || []
    bucket.push(row)
    byBankId.set(bankId, bucket)
  }

  const keptPayments: PayableTransactionRow[] = []
  for (const bucket of byBankId.values()) {
    const keeperId = pickPayablePaymentKeeperId(
      bucket.map((r) => ({ id: r.id, expense_accrual_id: r.expense_accrual_id }))
    )
    const keeper = keeperId != null ? bucket.find((r) => Number(r.id) === keeperId) : bucket[0]
    if (keeper) keptPayments.push(keeper)
  }

  return [...rest, ...keptPayments]
}

/**
 * 미지급 원장 로드.
 * 조회 경로에서는 DB를 절대 수정하지 않는다.
 * (과거: 조회마다 Payment 중복을 최대 24건씩 DELETE → 목록+요약 병렬 호출 시 잔액이 매번 달라짐)
 * DB 물리 정리는 scripts/apply-payable-payment-bank-dedupe.mjs 등 일회성 경로만 사용.
 */
export async function loadPayableTransactionsToEnd(params: {
  vendorFilter?: string
  endStr: string
}): Promise<PayableTransactionRow[]> {
  const parts: string[] = []
  if (params.vendorFilter) parts.push(`vendor_code=ilike.${encodeURIComponent(params.vendorFilter)}`)
  if (params.endStr) parts.push(`trans_date=lte.${params.endStr}`)
  const filter = parts.length ? parts.join('&') : 'id=gt.0'
  // order 필수: 없으면 PostgREST Range 페이지가 비결정적이라 조회마다 행이 빠지거나 겹침
  const rows = (await supabaseSelectFilterAllPages('payable_transactions', filter, {
    select: PAYABLE_LEDGER_SELECT,
    order: 'id.asc',
    pageSize: 8000,
    maxRows: 2_000_000,
  })) as PayableTransactionRow[]
  return dedupePayablePaymentLedgerRows(dedupeInboundPayableLedgerRows(rows))
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

/** 인보이스 번호 검색 — 종료일까지 이력에서 매칭 행을 보여 주고, 기간 합계는 조회 기간 내 매칭만 */
export function buildPayableListForInvoiceFilter(params: {
  invoiceFilter: string
  scopedRows: PayableTransactionRow[]
  periodRows: PayableTransactionRow[]
  cumulativeByVendor: Record<string, number>
}): {
  vendorCode: string
  balance: number
  cumulativeBalance: number
  items: PayableTransactionRow[]
}[] {
  const q = String(params.invoiceFilter || '').trim()
  if (!q) return []

  const matches = (r: PayableTransactionRow) => rowMatchesInvoiceFilter(r, q)
  const matchedScoped = params.scopedRows.filter(matches)
  if (matchedScoped.length === 0) return []

  const matchedPeriod = params.periodRows.filter(matches)
  const periodByVendor: Record<string, number> = {}
  for (const r of matchedPeriod) {
    const vc = String(r.vendor_code || '').trim()
    if (!vc) continue
    periodByVendor[vc] = (periodByVendor[vc] || 0) + Number(r.amount ?? 0)
  }

  const byVendor: Record<string, PayableTransactionRow[]> = {}
  for (const r of matchedScoped) {
    const vc = String(r.vendor_code || '').trim()
    if (!vc) continue
    if (!byVendor[vc]) byVendor[vc] = []
    byVendor[vc].push(r)
  }

  return Object.keys(byVendor)
    .map((vendorCode) => ({
      vendorCode,
      balance: periodByVendor[vendorCode] ?? 0,
      cumulativeBalance: params.cumulativeByVendor[vendorCode] ?? 0,
      items: byVendor[vendorCode].sort((a, b) =>
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
