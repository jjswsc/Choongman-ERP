import {
  buildHqVendorMatchIndex,
  isHqVendorPurchaseKey,
  partitionPurchaseVendorMapByHqCodes,
  shouldSkipStoreInboundForHqPurchase,
  type HqVendorMatchIndex,
} from '@/lib/accounting-reports-purchase-hq-dedupe'
import {
  sumBankTransactionsForAccounts,
  sumPayablesBalance,
  sumReceivablesBalance,
} from '@/lib/accounting-balance-summaries'
import { getGlBalancesAsOf, glBalanceForCode } from '@/lib/gl-balance-as-of'
import { sumCompletedPosSalesTotal } from '@/lib/accounting-pos-sales'
import { fetchStockLogPurchaseAgg, resolvePurchaseLocationPatterns } from '@/lib/accounting-stock-purchase-agg'
import {
  listHqOutboundPurchaseDrillLines,
  loadHqOutboundProcessedLines,
  resolveHqOutboundSalesCustomerFilter,
  sumHqOutboundSalesMatchingOutboundManagement,
  sumHqOutboundSubtotalMatchingOutboundManagement,
} from '@/lib/hq-outbound-income-total'
import {
  resolveAccountingStoreFilterFromAuth,
  resolveFranchiseeAccountingAllowedStoresOnly,
} from '@/lib/accounting-store-scope'
import {
  mergeBalanceSheetReports,
  mergeIncomeStatementReports,
} from '@/lib/accounting-income-statement-merge'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import {
  buildStoreFieldOrIlikeFragment,
  sqlIlikeContains,
  storeMatchesIncomeFilter,
} from '@/lib/accounting-store-match'
import {
  supabaseCountFilter,
  supabaseRpc,
  supabaseSelect,
  supabaseSelectAllPages,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
} from '@/lib/supabase-server'
import { getBangkokDateRangeUtc, getBangkokMonthRange } from '@/lib/bangkok-time'
import { resolveInventoryAsOfUtcIso, resolveStockValuationUnitCost } from '@/lib/accounting-inventory-asof'
import {
  sumEbitdaAddBacksFromExpenseSubjects,
  type IncomeStatementAmountBasisKind,
  type IncomeStatementDisplayAmounts,
  type IncomeStatementEbitdaBridge,
} from '@/lib/income-statement-display'
import {
  accumulateNetByItemTax,
  emptyNetVatBuckets,
  grossFromNetVatBuckets,
  mergeNetVatBuckets,
  netTotalFromBuckets,
  type ItemTaxType,
  type NetVatBuckets,
} from '@/lib/income-statement-item-vat'
import { loadItemTaxTypeMap } from '@/lib/income-statement-item-vat-server'
import { INBOUND_HQ_LOCATION, getStockLocationPatterns } from '@/lib/stock-location-patterns'

export {
  buildHqVendorMatchIndex,
  isHqVendorPurchaseKey,
  partitionPurchaseVendorMapByHqCodes,
  shouldSkipStoreInboundForHqPurchase,
  vendorRowIsHeadOffice,
} from '@/lib/accounting-reports-purchase-hq-dedupe'

const OFFICE_STORES = ['본사', 'Office', '오피스', '본점']
const BASE_LIMIT = 20000
const ACCOUNTING_ROWS_MAX = 1_000_000
const DELIVERY_APP_FEE_VENDOR_CODES = new Set([
  'GRAB_FEE',
  'LINEMAN_FEE',
  'SHOPEE_FEE',
  'ROBINHOOD_FEE',
])
const CARD_FEE_VENDOR_CODES = new Set([
  'CARD_FEE',
  'CARD_INSTALLMENT_FEE',
])

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isDeliveryAppFeeWithdrawRow(row: { vendor_code?: string | null; memo?: string | null }): boolean {
  const vendorCode = String(row.vendor_code || '').trim().toUpperCase()
  if (vendorCode && DELIVERY_APP_FEE_VENDOR_CODES.has(vendorCode)) return true
  const memo = String(row.memo || '').toLowerCase()
  if (!memo) return false
  return memo.includes('delivery app fee') || memo.includes('배달앱 수수료')
}

function isCardFeeWithdrawRow(row: { vendor_code?: string | null; memo?: string | null }): boolean {
  const vendorCode = String(row.vendor_code || '').trim().toUpperCase()
  if (vendorCode && CARD_FEE_VENDOR_CODES.has(vendorCode)) return true
  const memo = String(row.memo || '').toLowerCase()
  if (!memo) return false
  return memo.includes('card fee') || memo.includes('카드 수수료')
}

export type IncomeScopeInput = {
  yearMonth?: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  /** JWT allowedStores — 가맹 복수 매장·매니저 허용 매장 */
  allowedStores?: string[]
  includeDebug?: boolean
}

export type IncomeStatementLineDetail = {
  /** UI에서 `__pl_hq_orders__` 등 특수 키면 i18n으로 치환 */
  key: string
  amount: number
  /** vendors.name — 있으면 화면·엑셀에 코드 대신 표시 */
  label?: string
  /** 손익 화면 VAT 토글용 — 미설정 시 stock_net */
  amountBasis?: IncomeStatementAmountBasisKind
}

export type IncomeStatementReport = {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  timezone: 'Asia/Bangkok'
  sales: number
  purchases: number
  beginningInventory: number
  endingInventory: number
  cogs: number
  expenses: number
  grossProfit: number
  netProfit: number
  expenseBreakdown: {
    pettyCash: number
    bankWithdraw: number
    deliveryAppFees: number
    cardFees: number
    fixedExpenses: number
    total: number
  }
  /** 계정과목(세부)별 비용 — 현금시재·통장출금·고정비 합산 (표시명은 클라이언트에서 lang 반영) */
  expenseByAccountSubject?: {
    accountSubjectId: number | null
    code: string
    name: string
    nameEn: string | null
    nameTh: string | null
    amount: number
  }[]
  /** 매장: 본사 발주 + 직접입고 거래처별. 본사: 입고 거래처별 */
  purchaseByVendor?: IncomeStatementLineDetail[]
  /** 본사: 물류 출고(stock_logs) 매출처(vendor_target)별 매출 — 출고 관리와 동일 단가 */
  salesByCustomer?: IncomeStatementLineDetail[]
  /** 매장: POS 영업일별 매출 (posSalesByStore·일별 집계와 동일) */
  salesByDay?: IncomeStatementLineDetail[]
  /** 손익 화면 전용 — VAT 포함/제외 표시 (원천 집계는 변경 없음) */
  displayAmounts?: IncomeStatementDisplayAmounts
  /** 손익 화면 EBITDA 토글 — 당기순이익 가산 항목 */
  ebitdaBridge?: IncomeStatementEbitdaBridge
  diagnostics?: {
    warnings: string[]
    limits: Record<string, { fetched: number; limit: number; total?: number }>
    /** 직접 입고·통장 매입지급에 동시에 잡힌 거래처 키 — 이중 집계 가능성 안내 */
    purchaseInboundBankOverlapVendorKeys?: string[]
    /** 매장만: 본사 창고 출고 금액 vs 승인 발주 합계(참고) — 직납 등으로 차이 날 수 있음 */
    purchaseHqOutboundBasis?: {
      outboundTotal: number
      approvedOrdersTotal: number
      diff: number
    }
    /** 매장만: 본사 거래처 직접입고·통장 매입지급을 매입 합계에서 제외한 금액(본사 창고 출고와 이중 방지) */
    purchaseExcludedHqBankPayments?: { key: string; amount: number; label?: string }[]
  }
}

export type UnpostedBankTransaction = {
  id: number
  transDate: string
  amount: number
  category: string
  memo: string | null
  store: string | null
}

export type BalanceSheetLedgerBreakdown = {
  /** 분개 1130 잔액 (POS·정산·B2B 수금) */
  glAccount1130: number
  /** receivable_transactions 보조원장 합 */
  subledgerReceivables: number
  /** 분개 2110 잔액 */
  glAccount2110: number
  /** payable_transactions 보조원장 합 */
  subledgerPayables: number
  /** 분개 1010 (교차 검증용) */
  glAccount1010: number
  glSource: 'rpc' | 'select'
}

export type BalanceSheetReport = {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  timezone: 'Asia/Bangkok'
  assets: {
    cashAndBanks: number
    inventory: number
    /** 재무상태표 표시용 — 분개 1130 기준 */
    receivables: number
    total: number
  }
  liabilities: {
    /** 재무상태표 표시용 — 분개 2110 기준 */
    payables: number
    total: number
  }
  ledgerBreakdown?: BalanceSheetLedgerBreakdown
  equity: {
    openingCapital: number
    retainedEarningsYtd: number
    currentPeriodProfit: number
    total: number
  }
  balanceCheckDiff: number
  /** 분개되지 않은 통장 출금 (transfer, loan, advance, correction) - balanceCheckDiff 원인 추적용 */
  unpostedBankWithdrawals: UnpostedBankTransaction[]
}

export function isOfficeStore(s: string): boolean {
  const x = String(s || '').trim()
  return OFFICE_STORES.some((o) => x === o || x.toLowerCase().includes('office'))
}

export { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'

/** vendors.code(대소문자 무시) → 표시용 이름 */
async function loadVendorCodeNormToNameMap(): Promise<Record<string, string>> {
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

function enrichPurchaseByVendorLabels(
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

/** 같은 기간에 직접입고와 통장 매입지급(purchase_payment) 모두 양수인 거래처 코드 */
function collectInboundBankOverlapVendorKeys(
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

function mergeVendorAmountMap(target: Record<string, number>, add: Record<string, number>) {
  for (const [k, v] of Object.entries(add)) {
    const amt = Number(v) || 0
    if (amt <= 0) continue
    target[k] = (target[k] || 0) + amt
  }
}

/** 본사 법인 거래처 — 코드·상호명(입고 vendor_target) 매칭용 */
async function loadHqVendorMatchIndex(): Promise<HqVendorMatchIndex> {
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
async function sumHqOutboundPurchaseFromOffice(
  storeFilter: string | null,
  startStr: string,
  endStr: string
): Promise<{
  purchaseTotal: number
  expenseBySubject: Map<number | null, number>
  truncated?: boolean
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
  }
}

function buildHqOutboundFromOfficeFilter(
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

/**
 * 통장 출금 중 category=purchase_payment — 손익 '매입' 거래처별 내역에 반영 (미지급 정산 지급).
 * COGS용 입고·발주와 중복될 수 있으나, 사용자가 통장에서만 매입처를 구분해 등록한 경우 표시 누락을 막기 위함.
 */
async function fetchBankPurchasePaymentsByVendor(params: {
  isHQ: boolean
  storeFilter: string
  startStr: string
  endStr: string
}): Promise<Record<string, number>> {
  const { isHQ, storeFilter, startStr, endStr } = params
  let accountIds: number[] = []
  try {
    if (isHQ) {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as
        | { id?: number; store?: string }[]
        | null
      accountIds = (bankAccRows || [])
        .filter((a) => isOfficeStore(String(a.store || '')) || String(a.store || '').startsWith('Office-'))
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
    return {}
  }
  if (accountIds.length === 0) return {}
  const idList = accountIds.join(',')
  let btRows: { amount?: number; vendor_code?: string; store?: string | null }[] | null
  try {
    btRows = (await supabaseSelectFilter(
      'bank_transactions',
      `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw&category=eq.purchase_payment`,
      { select: 'amount,vendor_code,store', limit: BASE_LIMIT }
    )) as { amount?: number; vendor_code?: string; store?: string | null }[] | null
  } catch {
    return {}
  }
  const out: Record<string, number> = {}
  for (const r of btRows || []) {
    if (storeFilter !== 'All') {
      const bts = String(r.store || '').trim()
      if (isHQ) {
        if (bts && !isOfficeStore(bts) && !bts.startsWith('Office-')) continue
      } else {
        if (bts && !storeMatchesIncomeFilter(bts, storeFilter)) continue
      }
    }
    const v = String(r.vendor_code || '').trim() || '__pl_vendor_unknown__'
    out[v] = (out[v] || 0) + Math.abs(Number(r.amount) || 0)
  }
  return out
}

export function normalizeIncomeScope(input: IncomeScopeInput): {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
  /** 가맹 「내 매장 전체」— storeFilter All 이지만 이 목록만 합산 */
  allowedStoresOnly?: string[]
} {
  const authScope = {
    userRole: input.userRole,
    userStore: input.userStore,
    allowedStores: input.allowedStores,
  }
  const storeFilter = resolveAccountingStoreFilterFromAuth(input.storeFilter, authScope)
  const { yearMonth, startStr, endStr } = getBangkokMonthRange(input.yearMonth)
  const isHQ = isOfficeStore(storeFilter) || isHeadOfficeLikeStoreName(storeFilter)
  const allowedStoresOnly =
    storeFilter === 'All' && !isHQ
      ? resolveFranchiseeAccountingAllowedStoresOnly(authScope)
      : undefined
  return { yearMonth, startStr, endStr, storeFilter, isHQ, allowedStoresOnly }
}

type DirectInboundPurchaseOpts = {
  excludeHqLocations?: boolean
  /** 매장 손익: From HQ 입고는 본사 창고 출고와 이중 */
  excludeFromHqInbound?: boolean
  hqIndex?: HqVendorMatchIndex
}

async function getDirectInboundPurchasesByVendor(
  locationFilter: string | null,
  startStr: string,
  endStr: string,
  _itemCostMap: Record<string, number>,
  opts: DirectInboundPurchaseOpts = {},
  itemAccountSubjectMap: Map<string, number> = new Map(),
  accountSubjectMeta: Map<number, AccountSubjectMetaRow> = new Map()
): Promise<{ byVendor: Record<string, number>; expenseBySubject: Map<number | null, number> }> {
  const excludeHqLocations = Boolean(opts.excludeHqLocations)
  const excludeFromHqInbound = Boolean(opts.excludeFromHqInbound)
  const hqIndex = opts.hqIndex
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
  const expenseBySubject = new Map<number | null, number>()
  for (const r of rows) {
    const vendorTarget = r.vendor_target
    const referenceNo = r.reference_no
    if (shouldSkipStoreInboundForHqPurchase(vendorTarget, referenceNo, excludeFromHqInbound, hqIndex)) continue
    if (excludeHqLocations && (r.location === INBOUND_HQ_LOCATION || isOfficeStore(r.location))) continue
    const code = r.item_code
    if (!code) continue
    const line = r.line_amount
    if (!line) continue
    const routed = isExpenseRoutedItem(code, itemAccountSubjectMap, accountSubjectMeta)
    if (routed.isExpense) {
      addToSubjectMap(expenseBySubject, routed.subjectId, line)
      continue
    }
    const vKey = vendorTarget || '__pl_vendor_unknown__'
    byVendor[vKey] = (byVendor[vKey] || 0) + line
  }
  return { byVendor, expenseBySubject }
}

async function getFixedExpensesAggregate(
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
        if (!isOfficeStore(st) && !st.startsWith('Office-')) continue
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

function addToSubjectMap(map: Map<number | null, number>, subjectId: number | null | undefined, amount: number) {
  if (!amount) return
  const sid = subjectId != null && !isNaN(Number(subjectId)) ? Number(subjectId) : null
  map.set(sid, (map.get(sid) || 0) + amount)
}

type AccountSubjectMetaRow = {
  code: string
  name: string
  nameEn: string | null
  nameTh: string | null
  type: string
  pAndLSection: string | null
  statementType: string | null
}

async function loadAccountSubjectMeta(): Promise<Map<number, AccountSubjectMetaRow>> {
  const out = new Map<number, AccountSubjectMetaRow>()
  try {
    const rows = (await supabaseSelect('account_subjects', {
      select: 'id,code,name,name_en,name_th,type,p_and_l_section,statement_type',
      limit: 2000,
      order: 'sort_order.asc,code.asc',
    })) as
      | {
          id?: number
          code?: string
          name?: string
          name_en?: string | null
          name_th?: string | null
          type?: string
          p_and_l_section?: string | null
          statement_type?: string | null
        }[]
      | null
    for (const r of rows || []) {
      const id = r.id != null ? Number(r.id) : NaN
      if (isNaN(id)) continue
      const code = String(r.code || '').trim()
      const name = String(r.name || '').trim()
      const ne = r.name_en != null ? String(r.name_en).trim() : ''
      const nt = r.name_th != null ? String(r.name_th).trim() : ''
      const type = String((r as { type?: string }).type || '').trim().toLowerCase()
      const pAndLSectionRaw = String((r as { p_and_l_section?: string }).p_and_l_section || '').trim()
      const statementTypeRaw = String((r as { statement_type?: string }).statement_type || '').trim()
      out.set(id, {
        code,
        name,
        nameEn: ne || null,
        nameTh: nt || null,
        type,
        pAndLSection: pAndLSectionRaw ? pAndLSectionRaw.toLowerCase() : null,
        statementType: statementTypeRaw ? statementTypeRaw.toLowerCase() : null,
      })
    }
  } catch {
    // ignore
  }
  return out
}

async function loadItemAccountSubjectMap(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const rows = (await supabaseSelectAllPages('items', {
      select: 'code,account_subject_id',
      order: 'id.asc',
      pageSize: 8000,
      maxRows: ACCOUNTING_ROWS_MAX,
    })) as { code?: string; account_subject_id?: number | null }[] | null
    for (const r of rows || []) {
      const code = String(r.code || '').trim()
      const sid = r.account_subject_id != null ? Number(r.account_subject_id) : NaN
      if (!code || !Number.isFinite(sid) || sid <= 0) continue
      out.set(code, sid)
    }
  } catch {
    // account_subject_id 컬럼 미배포 환경 호환
  }
  return out
}

function isExpenseRoutedItem(
  itemCode: string,
  itemAccountSubjectMap: Map<string, number>,
  accountSubjectMeta: Map<number, AccountSubjectMetaRow>
): { isExpense: boolean; subjectId: number | null } {
  const sid = itemAccountSubjectMap.get(String(itemCode || '').trim())
  if (!sid || !Number.isFinite(sid) || sid <= 0) return { isExpense: false, subjectId: null }
  const meta = accountSubjectMeta.get(sid)
  if (!meta) return { isExpense: false, subjectId: sid }
  const isExpenseType = meta.type === 'expense'
  const isCostSection = meta.pAndLSection === 'cost'
  // cost(매출원가) 분류는 기존 매입 흐름 유지, 그 외 expense 계정은 비용으로 분리
  return { isExpense: isExpenseType && !isCostSection, subjectId: sid }
}

function mergeExpenseSubjectMaps(
  target: Map<number | null, number>,
  source: Map<number | null, number>
) {
  for (const [k, v] of source) {
    target.set(k, (target.get(k) || 0) + v)
  }
}

function buildExpenseByAccountList(
  map: Map<number | null, number>,
  meta: Map<number, AccountSubjectMetaRow>
): IncomeStatementReport['expenseByAccountSubject'] {
  const rows: NonNullable<IncomeStatementReport['expenseByAccountSubject']> = []
  for (const [sid, amt] of map) {
    if (!amt) continue
    if (sid == null) {
      rows.push({
        accountSubjectId: null,
        code: '',
        name: '',
        nameEn: null,
        nameTh: null,
        amount: amt,
      })
      continue
    }
    const m = meta.get(sid)
    rows.push({
      accountSubjectId: sid,
      code: m?.code ?? '',
      name: m?.name ?? '',
      nameEn: m?.nameEn ?? null,
      nameTh: m?.nameTh ?? null,
      amount: amt,
    })
  }
  rows.sort((a, b) => b.amount - a.amount)
  return rows
}

function isExcludedHqStockLocation(location: string): boolean {
  const n = String(location || '').trim().toLowerCase()
  if (!n) return true
  if (n === INBOUND_HQ_LOCATION.toLowerCase()) return true
  return isOfficeStore(location)
}

async function resolveInventoryLocationPatterns(
  locationFilter: string | null,
  excludeHq: boolean
): Promise<string[]> {
  if (locationFilter) return getStockLocationPatterns(locationFilter)
  if (!excludeHq) return []
  try {
    const rows = (await supabaseRpc<{ location: string }[]>('get_distinct_stock_locations', {})) as
      | { location?: string }[]
      | null
    return (rows || [])
      .map((r) => String(r.location || '').trim())
      .filter((loc) => loc && !isExcludedHqStockLocation(loc))
  } catch {
    return []
  }
}

/** get_store_stock RPC 우선, 미배포 시 getAppData와 동일한 select fallback */
async function fetchStoreStockQtyByItem(
  locationPatterns: string[],
  asOfUtcIso: string
): Promise<Record<string, number>> {
  try {
    const rows = (await supabaseRpc<{ item_code: string; total_qty: number }[]>('get_store_stock', {
      p_location_patterns: locationPatterns,
      p_as_of_date: asOfUtcIso,
    })) as { item_code?: string; total_qty?: number }[] | null

    const m: Record<string, number> = {}
    for (const r of rows || []) {
      const code = String(r.item_code || '').trim()
      if (!code) continue
      m[code] = Number(r.total_qty ?? 0)
    }
    return m
  } catch {
    let locFilter = 'id=gt.0'
    if (locationPatterns.length === 1) {
      locFilter = `location=ilike.${encodeURIComponent(locationPatterns[0])}`
    } else if (locationPatterns.length > 1) {
      locFilter = `or=(${locationPatterns.map((p) => `location.ilike.${encodeURIComponent(p)}`).join(',')})`
    }
    const dateSuffix = `&log_date=lte.${encodeURIComponent(asOfUtcIso)}`
    const rows = (await supabaseSelectFilterAllPages('stock_logs', `${locFilter}${dateSuffix}`, {
      order: 'id.asc',
      pageSize: 8000,
      maxRows: ACCOUNTING_ROWS_MAX,
      select: 'item_code,qty',
    })) as { item_code?: string; qty?: number }[] | null
    const m: Record<string, number> = {}
    for (const r of rows || []) {
      const code = String(r.item_code || '').trim()
      if (!code) continue
      m[code] = (m[code] || 0) + Number(r.qty || 0)
    }
    return m
  }
}

async function loadItemValuationUnitCostMap(): Promise<Record<string, number>> {
  const rows = (await supabaseSelectAllPages('items', {
    order: 'id.asc',
    pageSize: 8000,
    maxRows: ACCOUNTING_ROWS_MAX,
    select: 'code,cost,price',
  })) as
    | { code?: string; cost?: number | null; price?: number | null }[]
    | null
  const out: Record<string, number> = {}
  for (const r of rows || []) {
    const code = String(r.code || '').trim()
    if (!code) continue
    out[code] = resolveStockValuationUnitCost(r.cost, r.price)
  }
  return out
}

/** 재고 금액 — 재고 현황(getAppData·stock-table)과 동일: 전 품목 × (cost ?? price) */
async function getInventoryValue(
  locationFilter: string | null,
  cutoffDate: string,
  isBefore: boolean,
  itemUnitCostMap: Record<string, number>,
  excludeHq = false
): Promise<number> {
  const buckets = await getInventoryVatBuckets(
    locationFilter,
    cutoffDate,
    isBefore,
    itemUnitCostMap,
    new Map<string, ItemTaxType>(),
    excludeHq
  )
  return netTotalFromBuckets(buckets)
}

async function getInventoryVatBuckets(
  locationFilter: string | null,
  cutoffDate: string,
  isBefore: boolean,
  itemUnitCostMap: Record<string, number>,
  itemTaxMap: Map<string, ItemTaxType>,
  excludeHq = false
): Promise<NetVatBuckets> {
  const buckets = emptyNetVatBuckets()
  const asOfUtcIso = resolveInventoryAsOfUtcIso(cutoffDate, isBefore)
  const locationPatterns = await resolveInventoryLocationPatterns(locationFilter, excludeHq)
  const byItem = await fetchStoreStockQtyByItem(locationPatterns, asOfUtcIso)
  for (const [code, qty] of Object.entries(byItem)) {
    const unit = itemUnitCostMap[code] ?? 0
    accumulateNetByItemTax(buckets, code, qty * unit, itemTaxMap)
  }
  return buckets
}

async function getHqOutboundSalesVatBuckets(
  storeFilter: string,
  startStr: string,
  endStr: string,
  itemTaxMap: Map<string, ItemTaxType>
): Promise<NetVatBuckets> {
  const customerFilter = resolveHqOutboundSalesCustomerFilter(storeFilter)
  const { lines } = await loadHqOutboundProcessedLines({
    startStr,
    endStr,
    storeFilter: customerFilter,
  })
  const buckets = emptyNetVatBuckets()
  for (const line of lines) {
    const store = String(line.targetStore || '').trim()
    if (!store || isHeadOfficeLikeStoreName(store)) continue
    accumulateNetByItemTax(buckets, line.itemCode, line.lineAmount, itemTaxMap)
  }
  return buckets
}

async function getHqOutboundPurchaseVatBuckets(
  storeFilter: string | null,
  startStr: string,
  endStr: string,
  itemTaxMap: Map<string, ItemTaxType>
): Promise<NetVatBuckets> {
  const { lines } = await loadHqOutboundProcessedLines({
    startStr,
    endStr,
    storeFilter,
  })
  const buckets = emptyNetVatBuckets()
  for (const line of lines) {
    const target = String(line.targetStore || '').trim()
    if (isHeadOfficeLikeStoreName(target)) continue
    if (storeFilter && storeFilter !== 'All' && target && !storeMatchesIncomeFilter(target, storeFilter)) {
      continue
    }
    accumulateNetByItemTax(buckets, line.itemCode, line.lineAmount, itemTaxMap)
  }
  return buckets
}

async function getDirectInboundPurchaseVatBuckets(
  locationFilter: string | null,
  startStr: string,
  endStr: string,
  itemTaxMap: Map<string, ItemTaxType>,
  opts: DirectInboundPurchaseOpts = {},
  itemAccountSubjectMap: Map<string, number> = new Map(),
  accountSubjectMeta: Map<number, AccountSubjectMetaRow> = new Map()
): Promise<NetVatBuckets> {
  const buckets = emptyNetVatBuckets()
  const excludeHqLocations = Boolean(opts.excludeHqLocations)
  const excludeFromHqInbound = Boolean(opts.excludeFromHqInbound)
  const hqIndex = opts.hqIndex
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  const locationPatterns = await resolvePurchaseLocationPatterns(locationFilter, excludeHqLocations)
  const { rows } = await fetchStockLogPurchaseAgg({
    logTypes: ['Inbound'],
    startUtcIso: dayStartUtcIso,
    endUtcExclusive: nextDayStartUtcIso,
    locationPatterns,
    vendorPatterns: null,
  })
  for (const r of rows) {
    const vendorTarget = r.vendor_target
    const referenceNo = r.reference_no
    if (shouldSkipStoreInboundForHqPurchase(vendorTarget, referenceNo, excludeFromHqInbound, hqIndex)) continue
    if (excludeHqLocations && (r.location === INBOUND_HQ_LOCATION || isOfficeStore(r.location))) continue
    const code = r.item_code
    if (!code) continue
    const line = r.line_amount
    if (!line) continue
    const routed = isExpenseRoutedItem(code, itemAccountSubjectMap, accountSubjectMeta)
    if (routed.isExpense) continue
    accumulateNetByItemTax(buckets, code, line, itemTaxMap)
  }
  return buckets
}

async function sumDepreciationForIncomeStatement(
  yearMonth: string,
  storeFilter: string,
  isHQ: boolean
): Promise<number> {
  try {
    const entries = (await supabaseSelectFilter(
      'depreciation_entries',
      `year_month=eq.${encodeURIComponent(yearMonth)}`,
      { select: 'amount,fixed_asset_id', limit: 5000 }
    )) as { amount?: number; fixed_asset_id?: number }[] | null
    if (!entries?.length) return 0
    const assetIds = [
      ...new Set(entries.map((e) => e.fixed_asset_id).filter((id): id is number => id != null)),
    ]
    if (assetIds.length === 0) return 0
    const assets = (await supabaseSelectFilter(
      'fixed_assets',
      `id=in.(${assetIds.join(',')})`,
      { select: 'id,store_name', limit: 5000 }
    )) as { id?: number; store_name?: string }[] | null
    const storeByAsset = new Map<number, string>()
    for (const a of assets || []) {
      if (a.id != null) storeByAsset.set(a.id, String(a.store_name || '').trim())
    }
    let sum = 0
    for (const e of entries) {
      const aid = e.fixed_asset_id
      if (aid == null) continue
      const st = storeByAsset.get(aid) || ''
      if (isHQ) {
        if (st && !isOfficeStore(st) && !st.startsWith('Office-')) continue
      } else if (storeFilter !== 'All') {
        if (st && !storeMatchesIncomeFilter(st, storeFilter)) continue
      }
      sum += Math.abs(Number(e.amount) || 0)
    }
    return round2(sum)
  } catch {
    return 0
  }
}

function tagPurchaseVendorBasis(
  rows: IncomeStatementLineDetail[],
  bankVendorKeys: Set<string>
): IncomeStatementLineDetail[] {
  return rows.map((row) => {
    if (row.amountBasis) return row
    if (row.key === '__pl_hq_orders__') {
      return { ...row, amountBasis: 'stock_net' as const }
    }
    if (bankVendorKeys.has(row.key)) {
      return { ...row, amountBasis: 'cash_gross' as const }
    }
    return { ...row, amountBasis: 'stock_net' as const }
  })
}

export async function computeIncomeStatementReport(input: IncomeScopeInput): Promise<IncomeStatementReport> {
  const scope = normalizeIncomeScope(input)
  if (scope.allowedStoresOnly && scope.allowedStoresOnly.length > 1) {
    const perStore = await Promise.all(
      scope.allowedStoresOnly.map((store) =>
        computeIncomeStatementReport({
          ...input,
          storeFilter: store,
        })
      )
    )
    return mergeIncomeStatementReports(perStore, {
      yearMonth: scope.yearMonth,
      startStr: scope.startStr,
      endStr: scope.endStr,
    })
  }
  const { startStr, endStr, storeFilter, isHQ, yearMonth } = scope
  const warnings: string[] = []
  const limits: Record<string, { fetched: number; limit: number; total?: number }> = {}
  let purchaseInboundBankOverlapVendorKeys: string[] = []

  const [itemUnitCostMap, subjectMeta, itemAccountSubjectMap, itemTaxMap] = await Promise.all([
    loadItemValuationUnitCostMap(),
    loadAccountSubjectMeta(),
    loadItemAccountSubjectMap(),
    loadItemTaxTypeMap(),
  ])

  let sales = 0
  let salesNetForDisplay = 0
  let salesGrossForDisplay = 0
  let purchases = 0
  let purchasesStockNet = 0
  let purchasesBankGross = 0
  const bankPurchaseVendorKeys = new Set<string>()
  let pettyCashExpense = 0
  let bankWithdrawExpense = 0
  let deliveryAppFeeExpense = 0
  let cardFeeExpense = 0
  let fixedExpenses = 0
  let beginningInventory = 0
  let endingInventory = 0
  const expenseBySubjectMap = new Map<number | null, number>()
  let ordersPurchaseSubtotal = 0
  let purchaseByVendor: IncomeStatementLineDetail[] = []
  let salesByCustomer: IncomeStatementLineDetail[] = []
  let salesByDay: IncomeStatementLineDetail[] = []
  let purchaseHqOutboundBasis:
    | { outboundTotal: number; approvedOrdersTotal: number; diff: number }
    | undefined = undefined
  let purchaseExcludedHqBankPayments: { key: string; amount: number; label?: string }[] | undefined = undefined
  const excludedHqVendorDupRaw: { key: string; amount: number }[] = []

  if (isHQ) {
    const hqSalesAgg = await sumHqOutboundSalesMatchingOutboundManagement({
      startStr,
      endStr,
      storeFilter,
    })
    sales += hqSalesAgg.salesTotal
    salesNetForDisplay += hqSalesAgg.salesTotal
    salesByCustomer = hqSalesAgg.salesByCustomer.map((row) => ({
      ...row,
      amountBasis: 'stock_net' as const,
    }))
    limits.hq_outbound_sales = {
      fetched: hqSalesAgg.lineCount,
      limit: ACCOUNTING_ROWS_MAX,
    }
    if (hqSalesAgg.hitRowCap) {
      warnings.push(
        '본사 매출(물류 출고) 조회가 상한에 도달해 매출이 과소할 수 있습니다. 출고 관리와 동일 기준입니다.'
      )
    }

    const inboundHq = await getDirectInboundPurchasesByVendor(
      '입고등록',
      startStr,
      endStr,
      itemUnitCostMap,
      {},
      itemAccountSubjectMap,
      subjectMeta
    )
    const inboundByVendorHq = inboundHq.byVendor
    const bankPayByVendorHq = await fetchBankPurchasePaymentsByVendor({
      isHQ: true,
      storeFilter,
      startStr,
      endStr,
    })
    const purchaseVendorMapHq: Record<string, number> = { ...inboundByVendorHq }
    mergeVendorAmountMap(purchaseVendorMapHq, bankPayByVendorHq)
    purchaseInboundBankOverlapVendorKeys = collectInboundBankOverlapVendorKeys(
      inboundByVendorHq,
      bankPayByVendorHq
    )
    /** 거래처별 내역과 동일: 직접입고 + 통장 매입지급(purchase_payment) */
    const inboundHqTotal = Object.values(inboundByVendorHq).reduce((a, b) => a + b, 0)
    const bankHqTotal = Object.values(bankPayByVendorHq).reduce((a, b) => a + b, 0)
    for (const k of Object.keys(bankPayByVendorHq)) bankPurchaseVendorKeys.add(k)
    purchasesStockNet += inboundHqTotal
    purchasesBankGross += bankHqTotal
    purchases += inboundHqTotal + bankHqTotal
    mergeExpenseSubjectMaps(expenseBySubjectMap, inboundHq.expenseBySubject)

    const pettyAll = (await supabaseSelectFilter(
      'petty_cash_transactions',
      `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`,
      { select: 'store,amount,trans_type,account_subject_id', limit: BASE_LIMIT }
    )) as { store?: string; amount?: number; trans_type?: string; account_subject_id?: number | null }[] | null
    for (const r of pettyAll || []) {
      if ((r.trans_type || '').toLowerCase() !== 'expense') continue
      const st = String(r.store || '').trim()
      if (isOfficeStore(st) || st.startsWith('Office-')) {
        const amt = Math.abs(Number(r.amount) || 0)
        pettyCashExpense += amt
        addToSubjectMap(expenseBySubjectMap, r.account_subject_id, amt)
      }
    }
    limits.petty_cash = { fetched: pettyAll?.length || 0, limit: BASE_LIMIT }

    try {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as { id?: number; store?: string }[] | null
      const hqAccountIds = (bankAccRows || [])
        .filter((a) => isOfficeStore(String(a.store || '')) || String(a.store || '').startsWith('Office-'))
        .map((a) => a.id)
        .filter((id): id is number => id != null)
      if (hqAccountIds.length > 0) {
        const idList = hqAccountIds.join(',')
        const btRows = (await supabaseSelectFilter(
          'bank_transactions',
          `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw`,
          { select: 'amount,category,trans_date,expense_date,account_subject_id,vendor_code,memo', limit: BASE_LIMIT }
        )) as {
          amount?: number
          category?: string
          trans_date?: string
          expense_date?: string
          account_subject_id?: number | null
          vendor_code?: string | null
          memo?: string | null
        }[] | null
        for (const r of btRows || []) {
          const cat = String(r.category || 'expense').toLowerCase()
          if (['transfer', 'correction', 'loan', 'advance', 'unclassified', 'purchase_payment'].includes(cat)) continue
          const expDate = r.expense_date ? String(r.expense_date).slice(0, 10) : null
          const transDate = String(r.trans_date || '').slice(0, 10)
          const inRange = (d: string) => d >= startStr && d <= endStr
          if ((expDate && inRange(expDate)) || (!expDate && inRange(transDate))) {
            const amt = Math.abs(Number(r.amount) || 0)
            bankWithdrawExpense += amt
            if (isDeliveryAppFeeWithdrawRow(r)) deliveryAppFeeExpense += amt
            if (isCardFeeWithdrawRow(r)) cardFeeExpense += amt
            addToSubjectMap(expenseBySubjectMap, r.account_subject_id, amt)
          }
        }
        limits.bank_withdraw = { fetched: btRows?.length || 0, limit: BASE_LIMIT }
      }
    } catch {
      warnings.push('bank_transactions 조회 실패로 일부 지출이 누락될 수 있습니다.')
    }

    {
      const fx = await getFixedExpensesAggregate(storeFilter, yearMonth, true)
      fixedExpenses += fx.total
      mergeExpenseSubjectMaps(expenseBySubjectMap, fx.byAccountSubjectId)
    }
    beginningInventory = await getInventoryValue('본사', startStr, true, itemUnitCostMap, false)
    endingInventory = await getInventoryValue('본사', endStr, false, itemUnitCostMap, false)
    purchaseByVendor = Object.entries(purchaseVendorMapHq)
      .filter(([, v]) => v > 0)
      .map(([key, amount]) => ({ key, amount }))
      .sort((a, b) => b.amount - a.amount)
  } else {
    const posSalesSum = await sumCompletedPosSalesTotal({
      startStr,
      endStr,
      storeFilter,
    })
    sales += posSalesSum.total
    salesNetForDisplay += posSalesSum.totalNet
    salesGrossForDisplay += posSalesSum.total
    salesByDay = posSalesSum.salesByDay
      .filter((r) => r.amount > 0)
      .map((r) => ({
        key: r.key,
        amount: r.amount,
        label: r.label,
        amountBasis: 'pos_gross' as const,
      }))
    limits.pos_orders = {
      fetched: posSalesSum.completedCount,
      limit: 2_000_000,
    }
    if (posSalesSum.truncated) {
      warnings.push(
        'pos_orders 조회가 상한에 도달해 매출이 과소할 수 있습니다. (매출 관리와 동일 영업일 기준)'
      )
    }

    const orderFilter =
      `order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endStr)}&status=eq.Approved` +
      (storeFilter !== 'All' ? `&${buildStoreFieldOrIlikeFragment('store_name', storeFilter)}` : '')
    const [orders, hqVendorIndex] = await Promise.all([
      supabaseSelectFilterAllPages('orders', orderFilter, {
        select: 'total',
        pageSize: 8000,
        maxRows: ACCOUNTING_ROWS_MAX,
      }) as Promise<{ total?: number }[]>,
      loadHqVendorMatchIndex(),
    ])
    let hqOutboundAgg: {
      purchaseTotal: number
      expenseBySubject: Map<number | null, number>
      truncated?: boolean
    }
    try {
      hqOutboundAgg = await sumHqOutboundPurchaseFromOffice(
        storeFilter === 'All' ? null : storeFilter,
        startStr,
        endStr
      )
    } catch (e) {
      warnings.push(
        `본사 창고 출고(매입) 조회 실패 — 해당 금액을 0으로 처리했습니다. (${String(e).slice(0, 120)})`
      )
      hqOutboundAgg = { purchaseTotal: 0, expenseBySubject: new Map(), truncated: false }
    }
    let ordersApprovedSubtotal = 0
    for (const o of orders) ordersApprovedSubtotal += Number(o.total) || 0
    limits.orders_purchase = { fetched: orders.length, limit: BASE_LIMIT }
    if (orders.length >= ACCOUNTING_ROWS_MAX) {
      warnings.push('orders(승인 발주) 조회 상한에 도달해 참고 합계가 과소할 수 있습니다.')
    }
    try {
      const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
      const obFilter = buildHqOutboundFromOfficeFilter(
        storeFilter === 'All' ? null : storeFilter,
        dayStartUtcIso,
        nextDayStartUtcIso
      )
      const obCount = await supabaseCountFilter('stock_logs', obFilter)
      limits.hq_outbound = { fetched: obCount, limit: BASE_LIMIT }
    } catch {
      limits.hq_outbound = { fetched: 0, limit: BASE_LIMIT }
    }

    ordersPurchaseSubtotal = hqOutboundAgg.purchaseTotal
    mergeExpenseSubjectMaps(expenseBySubjectMap, hqOutboundAgg.expenseBySubject)
    if (hqOutboundAgg.truncated) {
      warnings.push('stock_logs(본사 창고 출고) 조회 상한에 도달해 매입이 과소할 수 있습니다.')
    }
    purchaseHqOutboundBasis = {
      outboundTotal: hqOutboundAgg.purchaseTotal,
      approvedOrdersTotal: ordersApprovedSubtotal,
      diff: round2(hqOutboundAgg.purchaseTotal - ordersApprovedSubtotal),
    }

    const storeInboundOpts: DirectInboundPurchaseOpts = {
      excludeFromHqInbound: true,
      hqIndex: hqVendorIndex,
      ...(storeFilter === 'All' ? { excludeHqLocations: true } : {}),
    }
    let inboundStore: Awaited<ReturnType<typeof getDirectInboundPurchasesByVendor>>
    try {
      inboundStore = await getDirectInboundPurchasesByVendor(
        storeFilter !== 'All' ? storeFilter : null,
        startStr,
        endStr,
        itemUnitCostMap,
        storeInboundOpts,
        itemAccountSubjectMap,
        subjectMeta
      )
    } catch (e) {
      warnings.push(
        `직접 입고(매입) 조회 실패 — 해당 금액을 0으로 처리했습니다. (${String(e).slice(0, 120)})`
      )
      inboundStore = { byVendor: {}, expenseBySubject: new Map() }
    }
    const { kept: inboundByVendorStore, excluded: inboundHqExcluded } = partitionPurchaseVendorMapByHqCodes(
      inboundStore.byVendor,
      hqVendorIndex
    )
    for (const row of inboundHqExcluded) excludedHqVendorDupRaw.push(row)
    const bankPayByVendorRaw = await fetchBankPurchasePaymentsByVendor({
      isHQ: false,
      storeFilter,
      startStr,
      endStr,
    })
    const bankPayByVendorStore: Record<string, number> = {}
    for (const [k, v] of Object.entries(bankPayByVendorRaw)) {
      const amt = Number(v) || 0
      if (amt <= 0) continue
      if (isHqVendorPurchaseKey(k, hqVendorIndex)) {
        excludedHqVendorDupRaw.push({ key: k, amount: amt })
        continue
      }
      bankPayByVendorStore[k] = amt
    }
    const purchaseVendorMapStore: Record<string, number> = { ...inboundByVendorStore }
    mergeVendorAmountMap(purchaseVendorMapStore, bankPayByVendorStore)
    purchaseInboundBankOverlapVendorKeys = collectInboundBankOverlapVendorKeys(
      inboundByVendorStore,
      bankPayByVendorStore
    )
    /** 본사 창고 출고 + 거래처별(직접입고 + 통장 매입지급, 본사 법인 제외) — 펼침 합계와 매입 총액 일치 */
    const inboundStoreTotal = Object.values(inboundByVendorStore).reduce((a, b) => a + b, 0)
    const bankStoreTotal = Object.values(bankPayByVendorStore).reduce((a, b) => a + b, 0)
    for (const k of Object.keys(bankPayByVendorStore)) bankPurchaseVendorKeys.add(k)
    purchasesStockNet += ordersPurchaseSubtotal + inboundStoreTotal
    purchasesBankGross += bankStoreTotal
    purchases += ordersPurchaseSubtotal + inboundStoreTotal + bankStoreTotal
    mergeExpenseSubjectMaps(expenseBySubjectMap, inboundStore.expenseBySubject)

    let pettyFilter = `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
    if (storeFilter !== 'All') {
      pettyFilter += `&${buildStoreFieldOrIlikeFragment('store', storeFilter)}`
    }
    const pettyRows = (await supabaseSelectFilter('petty_cash_transactions', pettyFilter, {
      select: 'amount,trans_type,account_subject_id',
      limit: BASE_LIMIT,
    })) as { amount?: number; trans_type?: string; account_subject_id?: number | null }[] | null
    for (const r of pettyRows || []) {
      if ((r.trans_type || '').toLowerCase() !== 'expense') continue
      const amt = Math.abs(Number(r.amount) || 0)
      pettyCashExpense += amt
      addToSubjectMap(expenseBySubjectMap, r.account_subject_id, amt)
    }
    limits.petty_cash = { fetched: pettyRows?.length || 0, limit: BASE_LIMIT }

    try {
      const bankAccRows = storeFilter !== 'All'
        ? ((await supabaseSelectFilter(
            'bank_accounts',
            buildStoreFieldOrIlikeFragment('store', storeFilter),
            { select: 'id', limit: 2000 }
          )) as { id?: number }[] | null)
        : ((await supabaseSelect('bank_accounts', { select: 'id', limit: 2000 })) as { id?: number }[] | null)
      const accountIds = (bankAccRows || []).map((a) => a.id).filter((id): id is number => id != null)
      if (accountIds.length > 0) {
        const idList = accountIds.join(',')
        const btRows = (await supabaseSelectFilter(
          'bank_transactions',
          `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw`,
          { select: 'amount,category,trans_date,expense_date,account_subject_id,vendor_code,memo', limit: BASE_LIMIT }
        )) as {
          amount?: number
          category?: string
          trans_date?: string
          expense_date?: string
          account_subject_id?: number | null
          vendor_code?: string | null
          memo?: string | null
        }[] | null
        for (const r of btRows || []) {
          const cat = String(r.category || 'expense').toLowerCase()
          if (['transfer', 'correction', 'loan', 'advance', 'unclassified', 'purchase_payment'].includes(cat)) continue
          const expDate = r.expense_date ? String(r.expense_date).slice(0, 10) : null
          const transDate = String(r.trans_date || '').slice(0, 10)
          const inRange = (d: string) => d >= startStr && d <= endStr
          if ((expDate && inRange(expDate)) || (!expDate && inRange(transDate))) {
            const amt = Math.abs(Number(r.amount) || 0)
            bankWithdrawExpense += amt
            if (isDeliveryAppFeeWithdrawRow(r)) deliveryAppFeeExpense += amt
            if (isCardFeeWithdrawRow(r)) cardFeeExpense += amt
            addToSubjectMap(expenseBySubjectMap, r.account_subject_id, amt)
          }
        }
        limits.bank_withdraw = { fetched: btRows?.length || 0, limit: BASE_LIMIT }
      }
    } catch {
      warnings.push('bank_transactions 조회 실패로 일부 지출이 누락될 수 있습니다.')
    }

    {
      const fx = await getFixedExpensesAggregate(storeFilter, yearMonth, false)
      fixedExpenses += fx.total
      mergeExpenseSubjectMaps(expenseBySubjectMap, fx.byAccountSubjectId)
    }

    if (storeFilter !== 'All') {
      beginningInventory = await getInventoryValue(storeFilter, startStr, true, itemUnitCostMap, false)
      endingInventory = await getInventoryValue(storeFilter, endStr, false, itemUnitCostMap, false)
    } else {
      beginningInventory = await getInventoryValue(null, startStr, true, itemUnitCostMap, true)
      endingInventory = await getInventoryValue(null, endStr, false, itemUnitCostMap, true)
    }

    purchaseByVendor = []
    if (ordersPurchaseSubtotal > 0) {
      purchaseByVendor.push({ key: '__pl_hq_orders__', amount: ordersPurchaseSubtotal })
    }
    for (const [key, amount] of Object.entries(purchaseVendorMapStore)) {
      if (amount > 0) purchaseByVendor.push({ key, amount })
    }
    purchaseByVendor.sort((a, b) => b.amount - a.amount)
  }

  if (input.includeDebug) {
    try {
      const countFilter =
        isHQ
          ? `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
          : `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
      const pettyTotalCount = await supabaseCountFilter('petty_cash_transactions', countFilter)
      if (pettyTotalCount > BASE_LIMIT) {
        warnings.push(`petty_cash_transactions 조회 건수가 limit(${BASE_LIMIT})를 초과합니다.`)
      }
      if (limits.petty_cash) limits.petty_cash.total = pettyTotalCount
    } catch {
      // ignore diagnostics errors
    }
  }

  const expenses = pettyCashExpense + bankWithdrawExpense + fixedExpenses
  const cogs = beginningInventory + purchases - endingInventory
  const grossProfit = sales - cogs
  const netProfit = grossProfit - expenses

  const expenseByAccountSubject = buildExpenseByAccountList(expenseBySubjectMap, subjectMeta)

  const begInvNet = beginningInventory
  const endInvNet = endingInventory

  let salesStockVatBuckets = emptyNetVatBuckets()
  let purchasesStockVatBuckets = emptyNetVatBuckets()

  if (isHQ) {
    salesStockVatBuckets = await getHqOutboundSalesVatBuckets(storeFilter, startStr, endStr, itemTaxMap)
    purchasesStockVatBuckets = await getDirectInboundPurchaseVatBuckets(
      '입고등록',
      startStr,
      endStr,
      itemTaxMap,
      {},
      itemAccountSubjectMap,
      subjectMeta
    )
  } else {
    const storeInboundOpts: DirectInboundPurchaseOpts = {
      excludeFromHqInbound: true,
      hqIndex: await loadHqVendorMatchIndex(),
      ...(storeFilter === 'All' ? { excludeHqLocations: true } : {}),
    }
    const [inboundBuckets, hqPurchaseBuckets] = await Promise.all([
      getDirectInboundPurchaseVatBuckets(
        storeFilter !== 'All' ? storeFilter : null,
        startStr,
        endStr,
        itemTaxMap,
        storeInboundOpts,
        itemAccountSubjectMap,
        subjectMeta
      ),
      getHqOutboundPurchaseVatBuckets(
        storeFilter === 'All' ? null : storeFilter,
        startStr,
        endStr,
        itemTaxMap
      ),
    ])
    purchasesStockVatBuckets = mergeNetVatBuckets(inboundBuckets, hqPurchaseBuckets)
  }

  const begInvBuckets = await getInventoryVatBuckets(
    isHQ ? '본사' : storeFilter !== 'All' ? storeFilter : null,
    startStr,
    true,
    itemUnitCostMap,
    itemTaxMap,
    !isHQ && storeFilter === 'All'
  )
  const endInvBuckets = await getInventoryVatBuckets(
    isHQ ? '본사' : storeFilter !== 'All' ? storeFilter : null,
    endStr,
    false,
    itemUnitCostMap,
    itemTaxMap,
    !isHQ && storeFilter === 'All'
  )

  if (isHQ) {
    salesNetForDisplay = netTotalFromBuckets(salesStockVatBuckets)
    salesGrossForDisplay = grossFromNetVatBuckets(salesStockVatBuckets)
  }
  if (salesNetForDisplay <= 0 && sales > 0) {
    salesNetForDisplay = sales
    salesGrossForDisplay = salesGrossForDisplay > 0 ? salesGrossForDisplay : sales
  }
  if (salesGrossForDisplay <= 0 && sales > 0) salesGrossForDisplay = sales

  const purchasesNetForDisplay = round2(purchasesStockNet + purchasesBankGross)
  const purchasesGrossForDisplay = round2(
    grossFromNetVatBuckets(purchasesStockVatBuckets) + purchasesBankGross
  )

  const displayAmounts: IncomeStatementDisplayAmounts = {
    salesGross: round2(salesGrossForDisplay),
    salesNet: round2(salesNetForDisplay),
    purchasesGross: purchasesGrossForDisplay,
    purchasesNet: purchasesNetForDisplay,
    beginningInventoryGross: grossFromNetVatBuckets(begInvBuckets),
    beginningInventoryNet: round2(begInvNet),
    endingInventoryGross: grossFromNetVatBuckets(endInvBuckets),
    endingInventoryNet: round2(endInvNet),
    ...(isHQ ? { salesStockVatBuckets } : {}),
    purchasesStockVatBuckets,
  }

  const depreciation = await sumDepreciationForIncomeStatement(yearMonth, storeFilter, isHQ)
  const ebitdaAdds = sumEbitdaAddBacksFromExpenseSubjects(expenseByAccountSubject)
  const ebitdaBridge: IncomeStatementEbitdaBridge = {
    depreciation,
    interest: ebitdaAdds.interest,
    incomeTax: ebitdaAdds.incomeTax,
  }

  const vendorNormToName = await loadVendorCodeNormToNameMap()
  purchaseByVendor = tagPurchaseVendorBasis(
    enrichPurchaseByVendorLabels(purchaseByVendor, vendorNormToName),
    bankPurchaseVendorKeys
  )
  if (excludedHqVendorDupRaw.length > 0) {
    purchaseExcludedHqBankPayments = excludedHqVendorDupRaw.map(({ key, amount }) => ({
      key,
      amount: round2(amount),
      label: vendorNormToName[key.toLowerCase()],
    }))
  }

  return {
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    timezone: 'Asia/Bangkok',
    sales,
    purchases,
    beginningInventory,
    endingInventory,
    cogs,
    expenses,
    grossProfit,
    netProfit,
    expenseBreakdown: {
      pettyCash: pettyCashExpense,
      bankWithdraw: bankWithdrawExpense,
      deliveryAppFees: deliveryAppFeeExpense,
      cardFees: cardFeeExpense,
      fixedExpenses,
      total: expenses,
    },
    expenseByAccountSubject,
    purchaseByVendor,
    salesByCustomer,
    ...(salesByDay.length > 0 ? { salesByDay } : {}),
    displayAmounts,
    ebitdaBridge,
    diagnostics:
      input.includeDebug ||
      warnings.length > 0 ||
      purchaseInboundBankOverlapVendorKeys.length > 0 ||
      purchaseHqOutboundBasis != null ||
      (purchaseExcludedHqBankPayments?.length ?? 0) > 0
        ? {
            warnings,
            limits: input.includeDebug ? limits : {},
            ...(purchaseInboundBankOverlapVendorKeys.length > 0
              ? { purchaseInboundBankOverlapVendorKeys }
              : {}),
            ...(purchaseHqOutboundBasis ? { purchaseHqOutboundBasis } : {}),
            ...(purchaseExcludedHqBankPayments?.length ? { purchaseExcludedHqBankPayments } : {}),
          }
        : undefined,
  }
}

const PURCHASE_DRILL_LIMIT = 500

export type IncomeStatementPurchaseDrillInboundRow = {
  kind: 'inbound'
  id: number | null
  logDate: string
  location: string
  itemCode: string
  qty: number
  unitCost: number
  lineAmount: number
  vendorTarget: string | null
}

export type IncomeStatementPurchaseDrillBankRow = {
  kind: 'bank'
  id: number
  transDate: string
  amount: number
  vendorCode: string | null
  memo: string | null
  note: string | null
  store: string | null
  /** 본사 발주와 연결 시 ref_type=Order 등 */
  refType: string | null
  refId: number | null
}

export type IncomeStatementPurchaseDrillOrderRow = {
  kind: 'hq_order'
  id: number
  orderDate: string
  total: number
  storeName: string | null
  status: string | null
}

/** 본사 창고→매장 출고 줄 — 손익 매입 본사 라인 상세 */
export type IncomeStatementPurchaseDrillHqOutboundRow = {
  kind: 'hq_outbound'
  id: number
  logDate: string
  logType: string | null
  itemCode: string
  targetStore: string | null
  qty: number
  unitPrice: number
  lineAmount: number
}

export type IncomeStatementPurchaseDrillDownResult = {
  vendorKey: string
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  /** 본사 출고(매입) 줄 — 매장 손익에서만 */
  isHqOrders: boolean
  /** 집계 기준: 본사 창고 출고 행 */
  hqOutbounds: IncomeStatementPurchaseDrillHqOutboundRow[]
  /** 참고: 동일 기간 승인 발주(금액은 출고 집계와 다를 수 있음) */
  hqOrders: IncomeStatementPurchaseDrillOrderRow[]
  inbound: IncomeStatementPurchaseDrillInboundRow[]
  bankPayments: IncomeStatementPurchaseDrillBankRow[]
  truncated: { inbound: boolean; bank: boolean; orders: boolean }
}

function drillVendorMatchesInboundRow(vendorKey: string, vendorTarget: string | null | undefined): boolean {
  const raw = String(vendorTarget || '').trim()
  if (vendorKey === '__pl_vendor_unknown__') return !raw
  return raw === String(vendorKey || '').trim()
}

function drillVendorMatchesBankRow(vendorKey: string, vendorCode: string | null | undefined): boolean {
  const raw = String(vendorCode || '').trim()
  if (vendorKey === '__pl_vendor_unknown__') return !raw
  return raw === String(vendorKey || '').trim()
}

async function loadItemCostMapForDrill(): Promise<Record<string, number>> {
  const itemRows = (await supabaseSelectAllPages('items', {
    order: 'id.asc',
    pageSize: 8000,
    maxRows: ACCOUNTING_ROWS_MAX,
    select: 'code,cost',
  })) as { code?: string; cost?: number }[] | null
  const itemCostMap: Record<string, number> = {}
  for (const r of itemRows || []) {
    const code = String(r.code || '').trim()
    if (code) itemCostMap[code] = Number(r.cost) || 0
  }
  return itemCostMap
}

/** 손익 매입 거래처 행 클릭 시 — 직접입고·통장 매입지급·(매장만) 본사승인 발주 */
export async function computeIncomeStatementPurchaseDrillDown(
  input: IncomeScopeInput & { vendorKey: string }
): Promise<IncomeStatementPurchaseDrillDownResult> {
  const vendorKey = String(input.vendorKey || '').trim()
  const scope = normalizeIncomeScope(input)
  const { yearMonth, startStr, endStr, storeFilter, isHQ } = scope
  const empty: IncomeStatementPurchaseDrillDownResult = {
    vendorKey,
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    isHqOrders: false,
    hqOutbounds: [],
    hqOrders: [],
    inbound: [],
    bankPayments: [],
    truncated: { inbound: false, bank: false, orders: false },
  }
  if (!vendorKey) return empty

  if (vendorKey === '__pl_hq_orders__') {
    if (isHQ) return { ...empty, isHqOrders: true }
    const { lines: obLines, hitRowCap } = await listHqOutboundPurchaseDrillLines({
      startStr,
      endStr,
      storeFilter: storeFilter === 'All' ? null : storeFilter,
    })
    const hqOutbounds: IncomeStatementPurchaseDrillHqOutboundRow[] = obLines.map((line) => ({
      kind: 'hq_outbound',
      id: line.id,
      logDate: line.logDate,
      logType: line.logType,
      itemCode: line.itemCode,
      targetStore: line.targetStore,
      qty: line.qty,
      unitPrice: line.unitPrice,
      lineAmount: line.lineAmount,
    }))
    const obTruncated = hitRowCap || hqOutbounds.length > PURCHASE_DRILL_LIMIT
    const hqOutboundsSlice = obTruncated ? hqOutbounds.slice(0, PURCHASE_DRILL_LIMIT) : hqOutbounds

    const orderFilter =
      `order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endStr)}&status=eq.Approved` +
      (storeFilter !== 'All' ? `&${buildStoreFieldOrIlikeFragment('store_name', storeFilter)}` : '')
    const orders = (await supabaseSelectFilterAllPages('orders', orderFilter, {
      select: 'id,order_date,total,store_name,status',
      pageSize: 8000,
      maxRows: ACCOUNTING_ROWS_MAX,
      order: 'order_date.desc',
    })) as { id?: number; order_date?: string; total?: number; store_name?: string; status?: string }[]
    const hqOrders: IncomeStatementPurchaseDrillOrderRow[] = []
    for (const o of orders) {
      const oid = Number(o.id)
      if (!oid) continue
      hqOrders.push({
        kind: 'hq_order',
        id: oid,
        orderDate: String(o.order_date || '').slice(0, 10),
        total: Number(o.total) || 0,
        storeName: o.store_name != null ? String(o.store_name) : null,
        status: o.status != null ? String(o.status) : null,
      })
    }
    const ordTruncated = orders.length >= ACCOUNTING_ROWS_MAX || hqOrders.length > PURCHASE_DRILL_LIMIT
    const hqOrdersSlice = ordTruncated ? hqOrders.slice(0, PURCHASE_DRILL_LIMIT) : hqOrders

    return {
      ...empty,
      isHqOrders: true,
      hqOutbounds: hqOutboundsSlice,
      hqOrders: hqOrdersSlice,
      truncated: { ...empty.truncated, orders: obTruncated || ordTruncated },
    }
  }

  const itemCostMap = await loadItemCostMapForDrill()
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  let inboundFilter = `log_type=eq.Inbound&log_date=gte.${dayStartUtcIso}&log_date=lt.${nextDayStartUtcIso}`
  if (isHQ) {
    inboundFilter += `&${buildStoreFieldOrIlikeFragment('location', '입고등록')}`
  } else if (storeFilter !== 'All') {
    inboundFilter += `&${buildStoreFieldOrIlikeFragment('location', storeFilter)}`
  }
  const inboundRaw = (await supabaseSelectFilter('stock_logs', inboundFilter, {
    select: 'id,log_date,location,item_code,qty,unit_cost,vendor_target,reference_no',
    limit: BASE_LIMIT,
    order: 'log_date.desc',
  })) as {
    id?: number
    log_date?: string
    location?: string
    item_code?: string
    qty?: number
    unit_cost?: number | null
    vendor_target?: string
    reference_no?: string | null
  }[] | null

  const excludeFromHqInboundDrill = !isHQ
  const hqVendorIndexDrill = excludeFromHqInboundDrill ? await loadHqVendorMatchIndex() : { codes: new Set<string>(), names: new Set<string>() }
  const inboundAcc: IncomeStatementPurchaseDrillInboundRow[] = []
  for (const r of inboundRaw || []) {
    const vendorTarget = String(r.vendor_target || '').trim()
    const referenceNo = String(r.reference_no || '').trim()
    if (shouldSkipStoreInboundForHqPurchase(vendorTarget, referenceNo, excludeFromHqInboundDrill, hqVendorIndexDrill)) continue
    if (
      !isHQ &&
      storeFilter === 'All' &&
      (r.location === '입고등록' || isOfficeStore(String(r.location || '')))
    ) {
      continue
    }
    if (!drillVendorMatchesInboundRow(vendorKey, vendorTarget)) continue
    const code = String(r.item_code || '').trim()
    if (!code) continue
    const qty = Number(r.qty) || 0
    const unitCost =
      r.unit_cost != null && !isNaN(Number(r.unit_cost)) ? Number(r.unit_cost) : (itemCostMap[code] ?? 0)
    const lineAmount = qty * unitCost
    if (!lineAmount) continue
    inboundAcc.push({
      kind: 'inbound',
      id: r.id != null ? Number(r.id) : null,
      logDate: String(r.log_date || '').slice(0, 10),
      location: String(r.location || '').trim(),
      itemCode: code,
      qty,
      unitCost,
      lineAmount,
      vendorTarget: vendorTarget || null,
    })
  }
  const inboundTruncated = inboundAcc.length > PURCHASE_DRILL_LIMIT
  const inbound = inboundTruncated ? inboundAcc.slice(0, PURCHASE_DRILL_LIMIT) : inboundAcc

  let accountIds: number[] = []
  try {
    if (isHQ) {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as
        | { id?: number; store?: string }[]
        | null
      accountIds = (bankAccRows || [])
        .filter((a) => isOfficeStore(String(a.store || '')) || String(a.store || '').startsWith('Office-'))
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
    accountIds = []
  }

  const bankAcc: IncomeStatementPurchaseDrillBankRow[] = []
  if (accountIds.length > 0) {
    const idList = accountIds.join(',')
    let btRows: {
      id?: number
      trans_date?: string
      amount?: number
      vendor_code?: string
      memo?: string | null
      note?: string | null
      store?: string | null
      ref_type?: string | null
      ref_id?: number | null
    }[] | null
    try {
      btRows = (await supabaseSelectFilter(
        'bank_transactions',
        `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw&category=eq.purchase_payment`,
        { select: 'id,trans_date,amount,vendor_code,memo,note,store,ref_type,ref_id', limit: BASE_LIMIT, order: 'trans_date.desc' }
      )) as typeof btRows
    } catch {
      btRows = null
    }
    for (const r of btRows || []) {
      if (storeFilter !== 'All') {
        const bts = String(r.store || '').trim()
        if (isHQ) {
          if (bts && !isOfficeStore(bts) && !bts.startsWith('Office-')) continue
        } else {
          if (bts && !storeMatchesIncomeFilter(bts, storeFilter)) continue
        }
      }
      if (!drillVendorMatchesBankRow(vendorKey, r.vendor_code)) continue
      const id = Number(r.id)
      if (!id) continue
      const rid = r.ref_id != null && !isNaN(Number(r.ref_id)) ? Number(r.ref_id) : null
      bankAcc.push({
        kind: 'bank',
        id,
        transDate: String(r.trans_date || '').slice(0, 10),
        amount: Math.abs(Number(r.amount) || 0),
        vendorCode: r.vendor_code != null ? String(r.vendor_code).trim() || null : null,
        memo: r.memo != null ? String(r.memo) : null,
        note: r.note != null ? String(r.note) : null,
        store: r.store != null ? String(r.store) : null,
        refType: r.ref_type != null ? String(r.ref_type).trim() || null : null,
        refId: rid,
      })
    }
  }
  const bankTruncated = bankAcc.length > PURCHASE_DRILL_LIMIT
  const bankPayments = bankTruncated ? bankAcc.slice(0, PURCHASE_DRILL_LIMIT) : bankAcc

  return {
    vendorKey,
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    isHqOrders: false,
    hqOutbounds: [],
    hqOrders: [],
    inbound,
    bankPayments,
    truncated: { inbound: inboundTruncated, bank: bankTruncated, orders: false },
  }
}

function getMonthsFromYearStart(yearMonth: string): string[] {
  const y = Number(yearMonth.slice(0, 4))
  const m = Number(yearMonth.slice(5, 7))
  const months: string[] = []
  for (let mm = 1; mm <= m; mm++) {
    months.push(`${y}-${String(mm).padStart(2, '0')}`)
  }
  return months
}

const UNPOSTED_WITHDRAW_CATEGORIES = ['transfer', 'loan', 'advance', 'correction'] as const

export async function computeBalanceSheetReport(input: IncomeScopeInput): Promise<BalanceSheetReport> {
  const scope = normalizeIncomeScope(input)
  if (scope.allowedStoresOnly && scope.allowedStoresOnly.length > 1) {
    const perStore = await Promise.all(
      scope.allowedStoresOnly.map((store) =>
        computeBalanceSheetReport({
          ...input,
          storeFilter: store,
        })
      )
    )
    return mergeBalanceSheetReports(perStore, {
      yearMonth: scope.yearMonth,
      startStr: scope.startStr,
      endStr: scope.endStr,
    })
  }
  const { yearMonth, startStr, endStr, storeFilter, isHQ } = scope

  let bankAccounts: { id?: number; store?: string; opening_balance?: number }[] = []
  try {
    if (isHQ) {
      bankAccounts = ((await supabaseSelect('bank_accounts', { select: 'id,store,opening_balance', limit: 2000 })) as
        | { id?: number; store?: string; opening_balance?: number }[]
        | null)?.filter((x) => isOfficeStore(String(x.store || '')) || String(x.store || '').startsWith('Office-')) || []
    } else if (storeFilter !== 'All') {
      bankAccounts =
        ((await supabaseSelectFilter(
          'bank_accounts',
          `store=ilike.${encodeURIComponent(sqlIlikeContains(storeFilter))}`,
          { select: 'id,store,opening_balance', limit: 2000 }
        )) as { id?: number; store?: string; opening_balance?: number }[] | null) || []
    } else {
      bankAccounts = ((await supabaseSelect('bank_accounts', { select: 'id,store,opening_balance', limit: 2000 })) as
        | { id?: number; store?: string; opening_balance?: number }[]
        | null) || []
    }
  } catch {
    bankAccounts = []
  }
  const accountIds = bankAccounts.map((a) => a.id).filter((id): id is number => id != null)
  const openingCash = bankAccounts.reduce((sum, a) => sum + (Number(a.opening_balance) || 0), 0)

  let bankDelta = 0
  if (accountIds.length > 0) {
    const bankSum = await sumBankTransactionsForAccounts(accountIds, endStr)
    bankDelta = bankSum.total
  }
  const cashAndBanks = openingCash + bankDelta

  const itemUnitCostMap = await loadItemValuationUnitCostMap()
  const inventory = isHQ
    ? await getInventoryValue('본사', endStr, false, itemUnitCostMap, false)
    : storeFilter !== 'All'
      ? await getInventoryValue(storeFilter, endStr, false, itemUnitCostMap, false)
      : await getInventoryValue(null, endStr, false, itemUnitCostMap, true)

  let subledgerReceivables = 0
  let subledgerPayables = 0
  try {
    const recv = await sumReceivablesBalance({ endStr, storeFilter, isHQ })
    subledgerReceivables = recv.total
  } catch {
    subledgerReceivables = 0
  }
  try {
    const pay = await sumPayablesBalance({ endStr, storeFilter, isHQ })
    subledgerPayables = pay.total
  } catch {
    subledgerPayables = 0
  }

  let receivables = subledgerReceivables
  let payables = subledgerPayables
  let glSource: 'rpc' | 'select' = 'select'
  let glAccount1130 = 0
  let glAccount2110 = 0
  let glAccount1010 = 0
  try {
    const gl = await getGlBalancesAsOf({ endStr, storeFilter, accountCodes: ['1010', '1130', '2110'] })
    glSource = gl.source
    glAccount1130 = glBalanceForCode(gl.rows, '1130')
    glAccount2110 = glBalanceForCode(gl.rows, '2110')
    glAccount1010 = glBalanceForCode(gl.rows, '1010')
    receivables = glAccount1130
    payables = glAccount2110
  } catch {
    /* RPC·select 폴백 실패 시 보조원장 유지 */
  }

  const currentIncome = await computeIncomeStatementReport({
    yearMonth,
    storeFilter,
    userStore: input.userStore,
    userRole: input.userRole,
    includeDebug: false,
  })

  const months = getMonthsFromYearStart(yearMonth)
  let retainedEarningsYtd = 0
  for (const ym of months) {
    const income = await computeIncomeStatementReport({
      yearMonth: ym,
      storeFilter,
      userStore: input.userStore,
      userRole: input.userRole,
      includeDebug: false,
    })
    retainedEarningsYtd += income.netProfit
  }

  const openingCapital = 0
  const equityTotal = openingCapital + retainedEarningsYtd
  const assetsTotal = cashAndBanks + inventory + receivables
  const liabilitiesTotal = payables
  const balanceCheckDiff = assetsTotal - (liabilitiesTotal + equityTotal)

  let unpostedBankWithdrawals: UnpostedBankTransaction[] = []
  if (accountIds.length > 0) {
    const idList = accountIds.join(',')
    const catOr = UNPOSTED_WITHDRAW_CATEGORIES.map((c) => `category.eq.${c}`).join(',')
    const filter = `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw&or=(${catOr})`
    const rows = (await supabaseSelectFilter('bank_transactions', filter, {
      select: 'id,trans_date,amount,category,memo,store',
      order: 'trans_date.asc',
      limit: 2000,
    })) as {
      id?: number
      trans_date?: string
      amount?: number
      category?: string
      memo?: string | null
      store?: string | null
    }[]
    unpostedBankWithdrawals = (rows || []).map((r) => ({
      id: Number(r.id || 0),
      transDate: String(r.trans_date || '').slice(0, 10),
      amount: Math.abs(Number(r.amount) || 0),
      category: String(r.category || ''),
      memo: r.memo != null ? String(r.memo) : null,
      store: r.store != null ? String(r.store) : null,
    }))
  }

  return {
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    timezone: 'Asia/Bangkok',
    assets: {
      cashAndBanks,
      inventory,
      receivables,
      total: assetsTotal,
    },
    liabilities: {
      payables,
      total: liabilitiesTotal,
    },
    equity: {
      openingCapital,
      retainedEarningsYtd,
      currentPeriodProfit: currentIncome.netProfit,
      total: equityTotal,
    },
    balanceCheckDiff,
    unpostedBankWithdrawals,
    ledgerBreakdown: {
      glAccount1130,
      subledgerReceivables,
      glAccount2110,
      subledgerPayables,
      glAccount1010,
      glSource,
    },
  }
}

const BANK_PL_EXCLUDED_WITHDRAW_CATEGORIES = new Set([
  'transfer',
  'correction',
  'loan',
  'advance',
  'unclassified',
  'purchase_payment',
])

function bankWithdrawCountsTowardPlExpense(category: string | null | undefined): boolean {
  return !BANK_PL_EXCLUDED_WITHDRAW_CATEGORIES.has(String(category || 'expense').toLowerCase())
}

function bankExpenseInPlPeriod(
  transDate: string,
  expenseDate: string | null | undefined,
  startStr: string,
  endStr: string
): boolean {
  const expDate = expenseDate ? String(expenseDate).slice(0, 10) : null
  const td = String(transDate || '').slice(0, 10)
  const inRange = (d: string) => d >= startStr && d <= endStr
  return (expDate != null && inRange(expDate)) || (!expDate && inRange(td))
}

function expenseDrillMatchesSubject(
  rowSubjectId: number | null | undefined,
  wantSubjectId: number | null
): boolean {
  const sid =
    rowSubjectId != null && !isNaN(Number(rowSubjectId)) ? Number(rowSubjectId) : null
  if (wantSubjectId == null) return sid == null
  return sid === wantSubjectId
}

async function resolveBankAccountIdsForIncomeScope(
  isHQ: boolean,
  storeFilter: string
): Promise<number[]> {
  try {
    if (isHQ) {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as
        | { id?: number; store?: string }[]
        | null
      return (bankAccRows || [])
        .filter((a) => isOfficeStore(String(a.store || '')) || String(a.store || '').startsWith('Office-'))
        .map((a) => Number(a.id))
        .filter((id) => !isNaN(id) && id > 0)
    }
    if (storeFilter !== 'All') {
      const bankAccRows = (await supabaseSelectFilter(
        'bank_accounts',
        buildStoreFieldOrIlikeFragment('store', storeFilter),
        { select: 'id', limit: 2000 }
      )) as { id?: number }[] | null
      return (bankAccRows || []).map((a) => Number(a.id)).filter((id) => !isNaN(id) && id > 0)
    }
    const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id', limit: 2000 })) as
      | { id?: number }[]
      | null
    return (bankAccRows || []).map((a) => Number(a.id)).filter((id) => !isNaN(id) && id > 0)
  } catch {
    return []
  }
}

const EXPENSE_DRILL_LIMIT = 500

export type IncomeStatementExpenseDrillPettyRow = {
  kind: 'petty'
  id: number
  transDate: string
  amount: number
  store: string | null
  memo: string | null
  transType: string
}

export type IncomeStatementExpenseDrillBankRow = {
  kind: 'bank'
  id: number
  transDate: string
  expenseDate: string | null
  amount: number
  category: string | null
  memo: string | null
  store: string | null
}

export type IncomeStatementExpenseDrillFixedRow = {
  kind: 'fixed'
  id: number
  name: string
  store: string
  monthlyAmount: number
  startYearMonth: string | null
  endYearMonth: string | null
  memo: string | null
}

export type IncomeStatementExpenseDrillDownResult = {
  accountSubjectKey: string
  accountSubjectId: number | null
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  petty: IncomeStatementExpenseDrillPettyRow[]
  bankWithdrawals: IncomeStatementExpenseDrillBankRow[]
  fixedExpenses: IncomeStatementExpenseDrillFixedRow[]
  truncated: { petty: boolean; bank: boolean; fixed: boolean }
}

/** 손익 비용 계정 행 클릭 — 패티 지출·통장 출금(손익 반영분)·고정비 */
export async function computeIncomeStatementExpenseDrillDown(
  input: IncomeScopeInput & { accountSubjectKey: string }
): Promise<IncomeStatementExpenseDrillDownResult> {
  const accountSubjectKey = String(input.accountSubjectKey || '').trim()
  const wantSubjectId =
    accountSubjectKey === '__unclassified__' || accountSubjectKey === ''
      ? null
      : Number(accountSubjectKey)
  const scope = normalizeIncomeScope(input)
  const { yearMonth, startStr, endStr, storeFilter, isHQ } = scope
  const empty: IncomeStatementExpenseDrillDownResult = {
    accountSubjectKey,
    accountSubjectId: wantSubjectId != null && !isNaN(wantSubjectId) ? wantSubjectId : null,
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    petty: [],
    bankWithdrawals: [],
    fixedExpenses: [],
    truncated: { petty: false, bank: false, fixed: false },
  }
  if (wantSubjectId != null && isNaN(wantSubjectId)) return empty

  let pettyFilter = `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
  if (!isHQ && storeFilter !== 'All') {
    pettyFilter += `&${buildStoreFieldOrIlikeFragment('store', storeFilter)}`
  }
  const pettyRaw = (await supabaseSelectFilter('petty_cash_transactions', pettyFilter, {
    select: 'id,trans_date,amount,store,memo,trans_type,account_subject_id',
    limit: BASE_LIMIT,
    order: 'trans_date.desc',
  })) as {
    id?: number
    trans_date?: string
    amount?: number
    store?: string
    memo?: string | null
    trans_type?: string
    account_subject_id?: number | null
  }[] | null

  const petty: IncomeStatementExpenseDrillPettyRow[] = []
  for (const r of pettyRaw || []) {
    const st = String(r.store || '').trim()
    if (isHQ) {
      if (!isOfficeStore(st) && !st.startsWith('Office-')) continue
    }
    if (!expenseDrillMatchesSubject(r.account_subject_id, wantSubjectId)) continue
    const pid = Number(r.id)
    if (!pid) continue
    petty.push({
      kind: 'petty',
      id: pid,
      transDate: String(r.trans_date || '').slice(0, 10),
      amount: Math.abs(Number(r.amount) || 0),
      store: r.store != null ? String(r.store) : null,
      memo: r.memo != null ? String(r.memo) : null,
      transType: String(r.trans_type || 'expense'),
    })
  }
  const pettyTruncated = (pettyRaw?.length || 0) >= BASE_LIMIT || petty.length > EXPENSE_DRILL_LIMIT
  const pettySlice = pettyTruncated ? petty.slice(0, EXPENSE_DRILL_LIMIT) : petty

  const accountIds = await resolveBankAccountIdsForIncomeScope(isHQ, storeFilter)
  const bankAcc: IncomeStatementExpenseDrillBankRow[] = []
  let bankFetchTruncated = false
  if (accountIds.length > 0) {
    const idList = accountIds.join(',')
    const btRows = (await supabaseSelectFilter(
      'bank_transactions',
      `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw`,
      {
        select: 'id,amount,category,trans_date,expense_date,account_subject_id,memo,store',
        limit: BASE_LIMIT,
        order: 'trans_date.desc',
      }
    )) as {
      id?: number
      amount?: number
      category?: string
      trans_date?: string
      expense_date?: string | null
      account_subject_id?: number | null
      memo?: string | null
      store?: string | null
    }[] | null
    bankFetchTruncated = (btRows?.length || 0) >= BASE_LIMIT
    for (const r of btRows || []) {
      if (!bankWithdrawCountsTowardPlExpense(r.category)) continue
      if (!bankExpenseInPlPeriod(String(r.trans_date || ''), r.expense_date, startStr, endStr)) continue
      if (!expenseDrillMatchesSubject(r.account_subject_id, wantSubjectId)) continue
      const bid = Number(r.id)
      if (!bid) continue
      bankAcc.push({
        kind: 'bank',
        id: bid,
        transDate: String(r.trans_date || '').slice(0, 10),
        expenseDate: r.expense_date ? String(r.expense_date).slice(0, 10) : null,
        amount: Math.abs(Number(r.amount) || 0),
        category: r.category != null ? String(r.category) : null,
        memo: r.memo != null ? String(r.memo) : null,
        store: r.store != null ? String(r.store) : null,
      })
    }
  }
  const bankTruncated = bankFetchTruncated || bankAcc.length > EXPENSE_DRILL_LIMIT
  const bankSlice = bankTruncated ? bankAcc.slice(0, EXPENSE_DRILL_LIMIT) : bankAcc

  const fixedRows: IncomeStatementExpenseDrillFixedRow[] = []
  try {
    const fxAll = (await supabaseSelect('fixed_expenses', {
      select: 'id,name,store,monthly_amount,start_year_month,end_year_month,memo,account_subject_id',
      limit: 2000,
    })) as {
      id?: number
      name?: string
      store?: string
      monthly_amount?: number
      start_year_month?: string | null
      end_year_month?: string | null
      memo?: string | null
      account_subject_id?: number | null
    }[] | null
    for (const r of fxAll || []) {
      const start = r.start_year_month ? String(r.start_year_month) : null
      const end = r.end_year_month ? String(r.end_year_month) : null
      const active = (!start || yearMonth >= start) && (!end || yearMonth <= end)
      if (!active) continue
      const st = String(r.store || '').trim()
      if (isHQ) {
        if (!isOfficeStore(st) && !st.startsWith('Office-')) continue
      } else if (storeFilter !== 'All') {
        if (!storeMatchesIncomeFilter(st, storeFilter)) continue
      }
      if (!expenseDrillMatchesSubject(r.account_subject_id, wantSubjectId)) continue
      const fid = Number(r.id)
      if (!fid) continue
      fixedRows.push({
        kind: 'fixed',
        id: fid,
        name: String(r.name || '').trim() || '—',
        store: st,
        monthlyAmount: Number(r.monthly_amount) || 0,
        startYearMonth: start,
        endYearMonth: end,
        memo: r.memo != null ? String(r.memo).trim() || null : null,
      })
    }
  } catch {
    // fixed_expenses 미배포
  }
  const fixedTruncated = fixedRows.length > EXPENSE_DRILL_LIMIT
  const fixedSlice = fixedTruncated ? fixedRows.slice(0, EXPENSE_DRILL_LIMIT) : fixedRows

  return {
    ...empty,
    petty: pettySlice,
    bankWithdrawals: bankSlice,
    fixedExpenses: fixedSlice,
    truncated: {
      petty: pettyTruncated,
      bank: bankTruncated,
      fixed: fixedTruncated,
    },
  }
}

