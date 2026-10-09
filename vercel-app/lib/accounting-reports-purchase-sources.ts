import {
  netBankPurchasePaymentForIncomeStatement,
  sumInboundLinkAmountsByBankTransactionId,
} from '@/lib/accounting-bank-purchase-inbound-net'
import {
  buildVendorPurchaseKeyIndex,
  type VendorPurchaseKeyIndex,
  type VendorRowForPurchaseKey,
} from '@/lib/accounting-purchase-vendor-key'
import {
  buildHqVendorMatchIndex,
  directSettlementStoreUnitPrice,
  isFromHqInboundVendor,
  isHqVendorPurchaseKey,
  shouldSkipStoreInboundForHqPurchase,
  type HqVendorMatchIndex,
} from '@/lib/accounting-reports-purchase-hq-dedupe'
import {
  fetchStockLogPurchaseAgg,
  purchaseInboundLocationMatchesStore,
  resolvePurchaseLocationPatterns,
} from '@/lib/accounting-stock-purchase-agg'
import { sumHqOutboundSubtotalMatchingOutboundManagement } from '@/lib/hq-outbound-income-total'
import { shouldExcludeBankWithdrawFromPlExpense } from '@/lib/bank-transaction-note-meta'
import {
  isPp30PlExpenseSubjectCode,
  PL_PP30_EXPENSE_SUBJECT_CODE,
  pp30PlPaymentWindowEnd,
  sumPp30RemittanceForTaxPeriod,
} from '@/lib/pp30-pl-remittance'
import {
  buildStoreFieldOrIlikeFragment,
  storeMatchesIncomeFilter,
} from '@/lib/accounting-store-match'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
} from '@/lib/supabase-server'
import { getBangkokDateRangeUtc } from '@/lib/bangkok-time'
import {
  accumulateNetByItemTax,
  emptyNetVatBuckets,
  mergeNetVatBuckets,
  type ItemTaxType,
  type NetVatBuckets,
} from '@/lib/income-statement-item-vat'
import { INBOUND_HQ_LOCATION } from '@/lib/stock-location-patterns'
import { safePlCashVat } from '@/lib/income-statement-cash-vat'
import {
  type AccountSubjectMetaRow,
  addToSubjectMap,
  bankExpenseInPlPeriod,
  isExpenseRoutedItem,
} from '@/lib/accounting-reports-expense-routing'
import {
  ACCOUNTING_ROWS_MAX,
  type IncomeStatementLineDetail,
  type IncomeStatementReport,
  isHqAccountingStoreRow,
  round2,
} from '@/lib/accounting-reports-shared'

export async function loadVendorPurchaseKeyIndex(): Promise<VendorPurchaseKeyIndex> {
  try {
    const rows = (await supabaseSelect('vendors', { select: 'code,name,gps_name', limit: 20000 })) as
      | VendorRowForPurchaseKey[]
      | null
    return buildVendorPurchaseKeyIndex(rows || [])
  } catch {
    return buildVendorPurchaseKeyIndex([])
  }
}

/** vendors.code(대소문자 무시) → 표시용 이름 */
export async function loadVendorCodeNormToNameMap(): Promise<Record<string, string>> {
  try {
    const rows = (await supabaseSelect('vendors', { select: 'code,name', limit: 20000 })) as
      | { code?: string; name?: string }[]
      | null
    const m: Record<string, string> = {}
    for (const r of rows || []) {
      const c = String(r.code || '').trim()
      const n = String(r.name || '').trim()
      if (!c) continue
      m[c.toLowerCase()] = n || c
    }
    return m
  } catch {
    return {}
  }
}

export function enrichPurchaseByVendorLabels(
  rows: IncomeStatementLineDetail[],
  vendorNormToName: Record<string, string>
): IncomeStatementLineDetail[] {
  return rows.map((r) => {
    const k = String(r.key || '').trim()
    if (!k || k.startsWith('__pl_')) return { ...r }
    const name = vendorNormToName[k.toLowerCase()]
    return name ? { ...r, label: name } : { ...r }
  })
}

export function mergeVendorAmountMap(target: Record<string, number>, add: Record<string, number>) {
  for (const [k, v] of Object.entries(add)) {
    const amt = Number(v) || 0
    if (amt <= 0) continue
    target[k] = (target[k] || 0) + amt
  }
}

/** 같은 기간에 직접입고와 통장 매입 대금이 함께 있는 거래처 */
export function collectInboundBankOverlapVendorKeys(
  inbound: Record<string, number>,
  bank: Record<string, number>
): string[] {
  const out: string[] = []
  for (const k of Object.keys(inbound)) {
    if ((Number(inbound[k]) || 0) > 0 && (Number(bank[k]) || 0) > 0) out.push(k)
  }
  out.sort()
  return out
}

export function pickVendorVatForKeptAmounts(
  vatByVendor: Record<string, number>,
  keptAmounts: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of Object.keys(keptAmounts)) {
    const v = Number(vatByVendor[k]) || 0
    if (v > 0) out[k] = round2(v)
  }
  return out
}

export function sumVendorMap(m: Record<string, number>): number {
  let s = 0
  for (const v of Object.values(m)) s += Number(v) || 0
  return round2(s)
}

/** 본사 법인 거래처 — 코드·상호명(입고 vendor_target) 매칭용 */
export async function loadHqVendorMatchIndex(): Promise<HqVendorMatchIndex> {
  try {
    const rows = (await supabaseSelect('vendors', {
      select: 'code,name,gps_name,type',
      limit: 20000,
    })) as { code?: string; name?: string; gps_name?: string | null; type?: string }[] | null
    return buildHqVendorMatchIndex(rows || [])
  } catch {
    return { codes: new Set(), names: new Set() }
  }
}

/**
 * 본사 창고 출고 매입 — 출고 관리와 동일: invoice 스냅샷 → 발주 cart 단가 → items.price(본사→매장 판매가).
 * (미수령 발주 가상 줄·Usage 는 제외)
 */
export async function sumHqOutboundPurchaseFromOffice(
  storeFilter: string | null,
  startStr: string,
  endStr: string
): Promise<{
  purchaseTotal: number
  expenseBySubject: Map<number | null, number>
  truncated?: boolean
  dedupedDuplicateCount?: number
}> {
  const split = await sumHqOutboundSubtotalMatchingOutboundManagement({
    startStr,
    endStr,
    storeFilter,
  })
  return {
    purchaseTotal: split.purchaseTotal,
    expenseBySubject: new Map(),
    truncated: split.hitRowCap || split.lineCount >= 100_000,
    dedupedDuplicateCount: split.dedupedDuplicateCount,
  }
}

export function buildHqOutboundFromOfficeFilter(
  storeFilter: string | null,
  dayStartUtcIso: string,
  nextDayStartUtcIso: string
): string {
  let filter =
    `log_type=in.(Outbound,ForceOutbound)` +
    `&log_date=gte.${dayStartUtcIso}&log_date=lt.${nextDayStartUtcIso}` +
    `&${buildStoreFieldOrIlikeFragment('location', '본사')}`
  if (storeFilter && storeFilter !== 'All') {
    filter += `&${buildStoreFieldOrIlikeFragment('vendor_target', storeFilter)}`
  }
  return filter
}

export async function loadInboundLinkedAmountByBankId(bankIds: number[]): Promise<Map<number, number>> {
  const unique = [...new Set(bankIds.filter((id) => id > 0))]
  if (unique.length === 0) return new Map()
  const CHUNK = 400
  const allLinks: { bank_transaction_id?: number; amount?: number }[] = []
  try {
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK)
      const rows = (await supabaseSelectFilterAllPages(
        'bank_transaction_inbound_links',
        `bank_transaction_id=in.(${chunk.join(',')})`,
        {
          select: 'bank_transaction_id,amount',
          order: 'id.asc',
          pageSize: 8000,
          maxRows: ACCOUNTING_ROWS_MAX,
        }
      )) as { bank_transaction_id?: number; amount?: number }[]
      if (rows?.length) allLinks.push(...rows)
    }
  } catch {
    return new Map()
  }
  return sumInboundLinkAmountsByBankTransactionId(allLinks)
}

/** 통장 출금 — 지급일(trans_date) 또는 비용인식일(expense_date)이 기간 내인 행 */
export function buildBankWithdrawPlPeriodOrFilter(startStr: string, endStr: string): string {
  return (
    `or=(and(trans_date.gte.${startStr},trans_date.lte.${endStr}),` +
    `and(expense_date.gte.${startStr},expense_date.lte.${endStr}))`
  )
}

type BankWithdrawPlRow = {
  id?: number
  amount?: number
  vat_amount?: number | null
  category?: string
  trans_date?: string
  expense_date?: string | null
  account_subject_id?: number | null
  vendor_code?: string | null
  memo?: string | null
  note?: string | null
  store?: string | null
}

type ExpenseAccrualVatByBankId = Map<number, { gross: number; vat: number }>

/** 통장 출금 ↔ 지급예정 VAT 보완용 (추정 없음) */
export async function loadExpenseAccrualVatByBankIds(bankIds: number[]): Promise<ExpenseAccrualVatByBankId> {
  const out: ExpenseAccrualVatByBankId = new Map()
  const ids = [...new Set(bankIds.filter((id) => id > 0))]
  if (ids.length === 0) return out
  try {
    const payables = (await supabaseSelectFilterAllPages(
      'payable_transactions',
      `bank_transaction_id=in.(${ids.join(',')})&expense_accrual_id=not.is.null`,
      {
        select: 'bank_transaction_id,expense_accrual_id',
        order: 'id.asc',
        pageSize: 2000,
        maxRows: ACCOUNTING_ROWS_MAX,
      }
    )) as { bank_transaction_id?: number | null; expense_accrual_id?: number | null }[]
    const bankToAccrual = new Map<number, number>()
    const accrualIds: number[] = []
    for (const p of payables || []) {
      const bankId = Number(p.bank_transaction_id || 0)
      const accrualId = Number(p.expense_accrual_id || 0)
      if (bankId <= 0 || accrualId <= 0) continue
      if (!bankToAccrual.has(bankId)) {
        bankToAccrual.set(bankId, accrualId)
        accrualIds.push(accrualId)
      }
    }
    if (accrualIds.length === 0) return out
    const accruals = (await supabaseSelectFilterAllPages(
      'expense_accruals',
      `id=in.(${[...new Set(accrualIds)].join(',')})`,
      {
        select: 'id,amount,vat_amount',
        order: 'id.asc',
        pageSize: 2000,
        maxRows: ACCOUNTING_ROWS_MAX,
      }
    )) as { id?: number; amount?: number; vat_amount?: number | null }[]
    const accrualById = new Map<number, { gross: number; vat: number }>()
    for (const a of accruals || []) {
      const id = Number(a.id || 0)
      if (id <= 0) continue
      const split = safePlCashVat(Number(a.amount) || 0, a.vat_amount)
      if (split.vat > 0) accrualById.set(id, { gross: split.gross, vat: split.vat })
    }
    for (const [bankId, accrualId] of bankToAccrual) {
      const acc = accrualById.get(accrualId)
      if (acc) out.set(bankId, acc)
    }
  } catch {
    // VAT 보완 실패 시 통장 명시 VAT만 사용
  }
  return out
}

export async function fetchBankWithdrawRowsForPl(
  accountIds: number[],
  startStr: string,
  endStr: string,
  opts?: { feeAccountSubjectIds?: ReadonlySet<number> }
): Promise<{ rows: BankWithdrawPlRow[]; fetched: number; truncated: boolean }> {
  if (accountIds.length === 0) return { rows: [], fetched: 0, truncated: false }
  const idList = accountIds.join(',')
  const filter =
    `account_id=in.(${idList})&trans_type=eq.withdraw&` +
    buildBankWithdrawPlPeriodOrFilter(startStr, endStr)
  const raw = (await supabaseSelectFilterAllPages('bank_transactions', filter, {
    select: 'id,amount,vat_amount,category,trans_date,expense_date,account_subject_id,vendor_code,memo,note,store',
    order: 'id.asc',
    pageSize: 8000,
    maxRows: ACCOUNTING_ROWS_MAX,
  })) as BankWithdrawPlRow[]
  /** 잔액 계산과 동일: expense_internal·세금납부(BS)는 손익 비용에서 제외(수수료 5528/5529만 예외) */
  const feeIds = opts?.feeAccountSubjectIds
  const rows = raw.filter(
    (r) => !shouldExcludeBankWithdrawFromPlExpense(r, feeIds ? { feeAccountSubjectIds: feeIds } : undefined)
  )
  const fetched = raw.length
  return { rows, fetched, truncated: fetched >= ACCOUNTING_ROWS_MAX }
}

async function loadBankAccountIdsForPlScope(params: {
  isHQ: boolean
  storeFilter: string
}): Promise<number[]> {
  const { isHQ, storeFilter } = params
  try {
    if (isHQ) {
      const bankAccRows = (await supabaseSelect('bank_accounts', {
        select: 'id,store',
        limit: 2000,
      })) as { id?: number; store?: string }[] | null
      return (bankAccRows || [])
        .filter((a) => isHqAccountingStoreRow(String(a.store || '')))
        .map((a) => Number(a.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    }
    if (storeFilter !== 'All') {
      const bankAccRows = (await supabaseSelectFilter(
        'bank_accounts',
        buildStoreFieldOrIlikeFragment('store', storeFilter),
        { select: 'id', limit: 2000 }
      )) as { id?: number }[] | null
      return (bankAccRows || []).map((a) => Number(a.id)).filter((id) => Number.isFinite(id) && id > 0)
    }
    const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id', limit: 2000 })) as {
      id?: number
    }[] | null
    return (bankAccRows || []).map((a) => Number(a.id)).filter((id) => Number.isFinite(id) && id > 0)
  } catch {
    return []
  }
}

/** VAT 포함 손익용 PP.30 납부 — 세금 귀속월. data.expenses에는 넣지 않음. */
export async function loadPp30VatRemittanceForIncomeStatement(params: {
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
}): Promise<number> {
  const accountIds = await loadBankAccountIdsForPlScope(params)
  if (accountIds.length === 0) return 0
  const payEndStr = pp30PlPaymentWindowEnd(params.endStr)
  const idList = accountIds.join(',')
  const filter =
    `account_id=in.(${idList})&trans_type=eq.withdraw&` +
    buildBankWithdrawPlPeriodOrFilter(params.startStr, payEndStr)
  try {
    const raw = (await supabaseSelectFilterAllPages('bank_transactions', filter, {
      select: 'id,amount,category,trans_date,expense_date,memo,note,store',
      order: 'id.asc',
      pageSize: 8000,
      maxRows: ACCOUNTING_ROWS_MAX,
    })) as BankWithdrawPlRow[]
    const scoped = (raw || []).filter((r) => {
      if (params.isHQ || params.storeFilter === 'All') return true
      const st = String(r.store || '').trim()
      if (!st) return true
      return storeMatchesIncomeFilter(st, params.storeFilter)
    })
    return sumPp30RemittanceForTaxPeriod(scoped, params.startStr, params.endStr)
  } catch {
    return 0
  }
}

export function appendPp30ExpenseSubject(
  rows: NonNullable<IncomeStatementReport['expenseByAccountSubject']> | undefined,
  amount: number
): NonNullable<IncomeStatementReport['expenseByAccountSubject']> {
  const base = [...(rows || [])]
  const amt = round2(Math.max(0, Number(amount) || 0))
  if (amt <= 0) return base
  if (base.some((r) => isPp30PlExpenseSubjectCode(r.code))) return base
  return [
    ...base,
    {
      accountSubjectId: null,
      code: PL_PP30_EXPENSE_SUBJECT_CODE,
      name: 'PP.30 부가세 납부 (세금 귀속월)',
      nameEn: 'PP.30 VAT remittance (tax month)',
      nameTh: 'ชำระ VAT PP.30 (เดือนภาษี)',
      amount: amt,
    },
  ]
}

/**
 * 통장 출금 category=purchase_payment — 손익 매입.
 * 기간은 인식일(expense_date). 인식일이 없으면 출금일.
 * 입고 연동된 금액은 직접입고와 겹치므로 빼고, 남은 금액만 거래처에 더한다.
 */
export async function fetchBankPurchasePaymentsByVendor(params: {
  isHQ: boolean
  storeFilter: string
  startStr: string
  endStr: string
}): Promise<{
  byVendor: Record<string, number>
  byVendorVat: Record<string, number>
  fetched: number
  truncated: boolean
}> {
  const { isHQ, storeFilter, startStr, endStr } = params
  const empty = { byVendor: {}, byVendorVat: {}, fetched: 0, truncated: false }
  let accountIds: number[] = []
  try {
    if (isHQ) {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as
        | { id?: number; store?: string }[]
        | null
      accountIds = (bankAccRows || [])
        .filter((a) => isHqAccountingStoreRow(String(a.store || '')))
        .map((a) => Number(a.id))
        .filter((id) => !isNaN(id) && id > 0)
    } else if (storeFilter !== 'All') {
      const bankAccRows = (await supabaseSelectFilter(
        'bank_accounts',
        buildStoreFieldOrIlikeFragment('store', storeFilter),
        { select: 'id', limit: 2000 }
      )) as { id?: number }[] | null
      accountIds = (bankAccRows || []).map((a) => Number(a.id)).filter((id) => !isNaN(id) && id > 0)
    } else {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id', limit: 2000 })) as { id?: number }[] | null
      accountIds = (bankAccRows || []).map((a) => Number(a.id)).filter((id) => !isNaN(id) && id > 0)
    }
  } catch {
    return empty
  }
  if (accountIds.length === 0) return empty
  const idList = accountIds.join(',')
  let btRows: {
    id?: number
    amount?: number
    vat_amount?: number | null
    vendor_code?: string
    store?: string | null
    trans_date?: string
    expense_date?: string | null
  }[] = []
  try {
    btRows = (await supabaseSelectFilterAllPages(
      'bank_transactions',
      `account_id=in.(${idList})&trans_type=eq.withdraw&category=eq.purchase_payment&${buildBankWithdrawPlPeriodOrFilter(startStr, endStr)}`,
      {
        select: 'id,amount,vat_amount,vendor_code,store,trans_date,expense_date',
        order: 'id.asc',
        pageSize: 8000,
        maxRows: ACCOUNTING_ROWS_MAX,
      }
    )) as typeof btRows
  } catch {
    return empty
  }
  const linkedByBankId = await loadInboundLinkedAmountByBankId(
    btRows.map((r) => Number(r.id)).filter((id) => id > 0)
  )
  const out: Record<string, number> = {}
  const outVat: Record<string, number> = {}
  for (const r of btRows) {
    if (!bankExpenseInPlPeriod(String(r.trans_date || ''), r.expense_date, startStr, endStr)) continue
    if (storeFilter !== 'All') {
      const bts = String(r.store || '').trim()
      if (isHQ) {
        if (bts && !isHqAccountingStoreRow(bts)) continue
      } else {
        if (bts && !storeMatchesIncomeFilter(bts, storeFilter)) continue
      }
    }
    const bankId = Number(r.id)
    const grossAmt = Math.abs(Number(r.amount) || 0)
    const netAmt = netBankPurchasePaymentForIncomeStatement(
      Number(r.amount) || 0,
      bankId > 0 ? linkedByBankId.get(bankId) || 0 : 0
    )
    if (netAmt <= 0) continue
    const v = String(r.vendor_code || '').trim() || '__pl_vendor_unknown__'
    out[v] = (out[v] || 0) + netAmt
    const vatFull = safePlCashVat(grossAmt, r.vat_amount).vat
    if (vatFull > 0 && grossAmt > 0) {
      const vatScaled = round2(vatFull * (netAmt / grossAmt))
      const vat = safePlCashVat(netAmt, vatScaled).vat
      if (vat > 0) outVat[v] = (outVat[v] || 0) + vat
    }
  }
  const fetched = btRows.length
  return { byVendor: out, byVendorVat: outVat, fetched, truncated: fetched >= ACCOUNTING_ROWS_MAX }
}

export type DirectInboundPurchaseOpts = {
  excludeHqLocations?: boolean
  /** 매장 손익: From HQ 입고는 본사 창고 출고와 이중. 직접정산(지두방) 수령은 예외 */
  excludeFromHqInbound?: boolean
  hqIndex?: HqVendorMatchIndex
}

type DirectSettlementPurchaseLookups = {
  identifiers: Set<string>
  vendorByItem: Map<string, string>
  priceByItem: Map<string, number>
}

export async function loadDirectSettlementPurchaseLookups(): Promise<DirectSettlementPurchaseLookups> {
  const empty: DirectSettlementPurchaseLookups = {
    identifiers: new Set(),
    vendorByItem: new Map(),
    priceByItem: new Map(),
  }
  try {
    const [vendorRows, itemRows] = await Promise.all([
      supabaseSelectFilter('vendors', 'direct_settlement=eq.true', {
        select: 'code,name,gps_name',
        limit: 500,
      }) as Promise<{ code?: string; name?: string; gps_name?: string | null }[] | null>,
      supabaseSelect('items', {
        select: 'code,vendor,price',
        limit: 10000,
        order: 'id.asc',
      }) as Promise<{ code?: string; vendor?: string | null; price?: number | null }[] | null>,
    ])
    const identifiers = new Set<string>()
    for (const r of vendorRows || []) {
      for (const raw of [r.code, r.name, r.gps_name]) {
        const v = String(raw || '').trim()
        if (v) identifiers.add(v)
      }
    }
    const vendorByItem = new Map<string, string>()
    const priceByItem = new Map<string, number>()
    for (const r of itemRows || []) {
      const code = String(r.code || '').trim()
      if (!code) continue
      const vendor = String(r.vendor || '').trim()
      if (vendor) vendorByItem.set(code, vendor)
      priceByItem.set(code, Number(r.price) || 0)
    }
    return { identifiers, vendorByItem, priceByItem }
  } catch {
    return empty
  }
}

export function directSettlementVendorKey(
  itemCode: string,
  lookups: DirectSettlementPurchaseLookups
): string | null {
  const ref = String(lookups.vendorByItem.get(itemCode) || '').trim()
  if (!ref || !lookups.identifiers.has(ref)) return null
  return ref
}

export async function getDirectInboundPurchasesByVendor(
  locationFilter: string | null,
  startStr: string,
  endStr: string,
  _itemCostMap: Record<string, number>,
  opts: DirectInboundPurchaseOpts = {},
  itemAccountSubjectMap: Map<string, number> = new Map(),
  accountSubjectMeta: Map<number, AccountSubjectMetaRow> = new Map(),
  itemTaxMap: Map<string, ItemTaxType> = new Map()
): Promise<{
  byVendor: Record<string, number>
  expenseBySubject: Map<number | null, number>
  /** 매입에 넣은 거래처만. 본사 거래처로 뺀 입고는 여기 없다. */
  vatBucketsByVendor: Record<string, NetVatBuckets>
  excludedHq: { key: string; amount: number }[]
}> {
  const excludeHqLocations = Boolean(opts.excludeHqLocations)
  const excludeFromHqInbound = Boolean(opts.excludeFromHqInbound)
  const hqIndex = opts.hqIndex
  const directSettlement = excludeFromHqInbound ? await loadDirectSettlementPurchaseLookups() : null
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  const locationPatterns = await resolvePurchaseLocationPatterns(locationFilter, excludeHqLocations)
  const { rows } = await fetchStockLogPurchaseAgg({
    logTypes: ['Inbound'],
    startUtcIso: dayStartUtcIso,
    endUtcExclusive: nextDayStartUtcIso,
    locationPatterns,
    vendorPatterns: null,
  })

  const byVendor: Record<string, number> = {}
  const vatBucketsByVendor: Record<string, NetVatBuckets> = {}
  const excludedHqMap: Record<string, number> = {}
  const expenseBySubject = new Map<number | null, number>()
  for (const r of rows) {
    if (!purchaseInboundLocationMatchesStore(r.location, locationFilter)) continue
    const vendorTarget = r.vendor_target
    const referenceNo = r.reference_no
    const code = r.item_code
    const directVendorKey =
      code && directSettlement ? directSettlementVendorKey(code, directSettlement) : null
    if (
      shouldSkipStoreInboundForHqPurchase(vendorTarget, referenceNo, excludeFromHqInbound, hqIndex) &&
      !directVendorKey
    ) {
      const line = r.line_amount
      const fromHq = isFromHqInboundVendor(vendorTarget)
      if (!fromHq && line && hqIndex && isHqVendorPurchaseKey(vendorTarget, hqIndex)) {
        const key = vendorTarget || '__pl_vendor_unknown__'
        excludedHqMap[key] = (excludedHqMap[key] || 0) + line
      }
      continue
    }
    if (excludeHqLocations && (r.location === INBOUND_HQ_LOCATION || isHqAccountingStoreRow(r.location))) continue
    if (!code) continue
    const aggregatedUnit = r.line_qty > 0 ? r.line_amount / r.line_qty : 0
    const line = directVendorKey
      ? round2(
          r.line_qty *
            directSettlementStoreUnitPrice({
              aggregatedUnit,
              masterPrice: directSettlement?.priceByItem.get(code) || 0,
              masterCost: Number(_itemCostMap[code]) || 0,
            })
        )
      : r.line_amount
    if (!line) continue
    const routed = isExpenseRoutedItem(code, itemAccountSubjectMap, accountSubjectMeta)
    if (routed.isExpense) {
      addToSubjectMap(expenseBySubject, routed.subjectId, line)
      continue
    }
    const vKey = directVendorKey || vendorTarget || '__pl_vendor_unknown__'
    byVendor[vKey] = (byVendor[vKey] || 0) + line
    if (!vatBucketsByVendor[vKey]) vatBucketsByVendor[vKey] = emptyNetVatBuckets()
    accumulateNetByItemTax(vatBucketsByVendor[vKey], code, line, itemTaxMap)
  }
  const excludedHq = Object.entries(excludedHqMap).map(([key, amount]) => ({ key, amount }))
  return { byVendor, expenseBySubject, vatBucketsByVendor, excludedHq }
}

export function mergeVatBucketsForKeys(
  byVendor: Record<string, NetVatBuckets>,
  keys: string[]
): NetVatBuckets {
  let out = emptyNetVatBuckets()
  for (const key of keys) {
    const buckets = byVendor[key]
    if (!buckets) continue
    out = mergeNetVatBuckets(out, buckets)
  }
  return out
}

export async function getFixedExpensesAggregate(
  storeFilter: string,
  yearMonthStr: string,
  isHQ: boolean
): Promise<{ total: number; byAccountSubjectId: Map<number | null, number> }> {
  const byAccountSubjectId = new Map<number | null, number>()
  try {
    const all = (await supabaseSelect('fixed_expenses', {
      select: 'store,monthly_amount,start_year_month,end_year_month,account_subject_id',
      limit: 2000,
    })) as
      | {
          store?: string
          monthly_amount?: number
          start_year_month?: string | null
          end_year_month?: string | null
          account_subject_id?: number | null
        }[]
      | null
    if (!all?.length) return { total: 0, byAccountSubjectId }
    let total = 0
    for (const r of all) {
      const start = r.start_year_month ? r.start_year_month : null
      const end = r.end_year_month ? r.end_year_month : null
      const active = (!start || yearMonthStr >= start) && (!end || yearMonthStr <= end)
      if (!active) continue
      const st = String(r.store || '').trim()
      if (isHQ) {
        if (!isHqAccountingStoreRow(st)) continue
      } else if (storeFilter !== 'All') {
        if (!storeMatchesIncomeFilter(st, storeFilter)) continue
      }
      const amt = Number(r.monthly_amount) || 0
      total += amt
      const sid = r.account_subject_id != null && !isNaN(Number(r.account_subject_id)) ? Number(r.account_subject_id) : null
      byAccountSubjectId.set(sid, (byAccountSubjectId.get(sid) || 0) + amt)
    }
    return { total, byAccountSubjectId }
  } catch {
    return { total: 0, byAccountSubjectId }
  }
}
