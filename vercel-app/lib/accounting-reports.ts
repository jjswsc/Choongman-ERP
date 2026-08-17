import {
  netBankPurchasePaymentForIncomeStatement,
  sumInboundLinkAmountsByBankTransactionId,
} from '@/lib/accounting-bank-purchase-inbound-net'
import {
  buildVendorPurchaseKeyIndex,
  excludeBankPurchasesWhenDirectInboundPresent,
  normalizeVendorAmountMap,
  purchaseVendorKeyMatchesRaw,
  type VendorPurchaseKeyIndex,
  type VendorRowForPurchaseKey,
} from '@/lib/accounting-purchase-vendor-key'
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
  resolveAccountingRollupStores,
  parseCommaSeparatedStoreFilter,
  resolveFranchiseeAccountingAllowedStoresOnly,
} from '@/lib/accounting-store-scope'
import {
  mergeBalanceSheetReports,
  mergeIncomeStatementReports,
} from '@/lib/accounting-income-statement-merge'
import { shouldExcludeBankWithdrawFromPlExpense } from '@/lib/bank-transaction-note-meta'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStore } from '@/lib/permissions'
import {
  sumEbitdaAddBacksFromExpenseSubjects,
  type IncomeStatementAmountBasisKind,
  type IncomeStatementDisplayAmounts,
  type IncomeStatementEbitdaBridge,
} from '@/lib/income-statement-display'
import {
  buildStoreFieldOrIlikeFragment,
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
import { appendInventoryTenantFilter } from '@/lib/inventory-tenant-scope'
import {
  loadFranchiseBillingForIncomeStatement,
  PL_FRANCHISE_BILLING_SALES_KEY,
  type FranchiseBillingPlSlice,
} from '@/lib/accounting-po-franchise-billing-pl'
import { PL_FRANCHISE_EXPENSE_SUBJECT_CODES } from '@/lib/accounting-po-franchise-billing-pl-shared'
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
import {
  isSalaryLikePlExpenseRow,
  loadPayrollAggregateForIncomeStatement,
  resolveSalaryCashPlDecision,
} from '@/lib/accounting-payroll-pl'
import { plFetchEndStrWithPayrollPayWindow } from '@/lib/payroll-utils'
import { INBOUND_HQ_LOCATION, getStockLocationPatterns } from '@/lib/stock-location-patterns'
import { PL_PETTY_CASH_PURCHASE_VENDOR_KEY } from '@/lib/income-statement-purchase-drill-nav'
import { resolveBankPlCashVat, safePlCashVat } from '@/lib/income-statement-cash-vat'

export {
  buildHqVendorMatchIndex,
  isHqVendorPurchaseKey,
  partitionPurchaseVendorMapByHqCodes,
  shouldSkipStoreInboundForHqPurchase,
  vendorRowIsHeadOffice,
} from '@/lib/accounting-reports-purchase-hq-dedupe'

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
  /** Omni JWT tenantId */
  tenantId?: string
}

export type IncomeStatementLineDetail = {
  /** UI에서 `__pl_hq_orders__` 등 특수 키면 i18n으로 치환 */
  key: string
  amount: number
  /** vendors.name — 있으면 화면·엑셀에 코드 대신 표시 */
  label?: string
  /** 손익 화면 VAT 토글용 — 미설정 시 stock_net */
  amountBasis?: IncomeStatementAmountBasisKind
  /** 통장·패티 매입 등 cash_gross 행의 명시 VAT (원천 amount는 gross) */
  vatAmount?: number
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
    /** 입고 품목이 비용 계정으로 라우팅된 금액(패티·통장·고정비 외) */
    stockInboundExpense: number
    /** 확정 급여(payroll_records) 인건비 — net+sso+tax */
    payrollExpense: number
    /** 감가상각(depreciation_entries) — 당기순이익 비용에 포함 */
    depreciationExpense: number
    /** 승인 회계 PO 로열티 — VAT 포함(total) 기준 저장, 화면은 displayAmounts로 토글 */
    franchiseRoyalty: number
    /** 승인 회계 PO 배달 GP */
    franchiseDeliveryGp: number
    /** 승인 회계 PO Grab GP */
    franchiseGrabGp: number
    /** billingKind=all 합산 */
    franchiseBillingCombined: number
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
    /** 명시 VAT 합 — VAT 제외 표시 시 amount에서 차감 */
    vatAmount?: number
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
    /**
     * 직접 입고와 통장 매입지급이 같은 달에 동시에 잡힌 거래처 키.
     * 합계에서는 해당 키의 통장 매입지급을 이미 제외함(안내 목적).
     */
    purchaseInboundBankOverlapVendorKeys?: string[]
    /** 매장만: 본사 창고 출고 금액 vs 승인 발주 합계(참고) — 직납 등으로 차이 날 수 있음 */
    purchaseHqOutboundBasis?: {
      outboundTotal: number
      approvedOrdersTotal: number
      diff: number
    }
    /** 매장: 동일 주문 출고 stock_logs 중복 행을 손익 집계에서 제외한 건수 */
    hqOutboundDuplicateLinesDeduped?: number
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

/** 손익 본사 집계 — bank_accounts.store·petty_cash.store 등 (HQ·Head Office·Office-부서 포함) */
export function isHqAccountingStoreRow(store: string): boolean {
  const s = String(store || '').trim()
  if (!s) return false
  return isOfficeStore(s) || isHeadOfficeLikeStoreName(s) || s.startsWith('Office-')
}

export { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'

async function loadVendorPurchaseKeyIndex(): Promise<VendorPurchaseKeyIndex> {
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

async function loadInboundLinkedAmountByBankId(bankIds: number[]): Promise<Map<number, number>> {
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
async function loadExpenseAccrualVatByBankIds(bankIds: number[]): Promise<ExpenseAccrualVatByBankId> {
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

function pickVendorVatForKeptAmounts(
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

function sumVendorMap(m: Record<string, number>): number {
  let s = 0
  for (const v of Object.values(m)) s += Number(v) || 0
  return round2(s)
}

async function fetchBankWithdrawRowsForPl(
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

/**
 * 통장 출금 중 category=purchase_payment — 손익 '매입' 거래처별 내역.
 * 입고 연동(bank_transaction_inbound_links)된 금액은 직접입고와 이중이므로 제외. 미연동분만 합산(통장만 등록한 매입 포함).
 */
async function fetchBankPurchasePaymentsByVendor(params: {
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
    return { byVendor: {}, byVendorVat: {}, fetched: 0, truncated: false }
  }
  if (accountIds.length === 0) return { byVendor: {}, byVendorVat: {}, fetched: 0, truncated: false }
  const idList = accountIds.join(',')
  let btRows: {
    id?: number
    amount?: number
    vat_amount?: number | null
    vendor_code?: string
    store?: string | null
  }[] = []
  try {
    btRows = (await supabaseSelectFilterAllPages(
      'bank_transactions',
      `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw&category=eq.purchase_payment`,
      {
        select: 'id,amount,vat_amount,vendor_code,store',
        order: 'id.asc',
        pageSize: 8000,
        maxRows: ACCOUNTING_ROWS_MAX,
      }
    )) as {
      id?: number
      amount?: number
      vat_amount?: number | null
      vendor_code?: string
      store?: string | null
    }[]
  } catch {
    return { byVendor: {}, byVendorVat: {}, fetched: 0, truncated: false }
  }
  const linkedByBankId = await loadInboundLinkedAmountByBankId(
    btRows.map((r) => Number(r.id)).filter((id) => id > 0)
  )
  const out: Record<string, number> = {}
  const outVat: Record<string, number> = {}
  for (const r of btRows) {
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
    // 입고 연동으로 일부만 남을 때 VAT도 비례 (명시 VAT만)
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

export function normalizeIncomeScope(input: IncomeScopeInput): {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
  /** 가맹 「내 매장 전체」— storeFilter All 이지만 이 목록만 합산 */
  allowedStoresOnly?: string[]
  /** 본사·가맹 — 쉼표 구분 명시 복수 매장 선택 */
  selectedStoresOnly?: string[]
} {
  const authScope = {
    userRole: input.userRole,
    userStore: input.userStore,
    allowedStores: input.allowedStores,
  }
  const storeFilter = resolveAccountingStoreFilterFromAuth(input.storeFilter, authScope)
  const { yearMonth, startStr, endStr } = getBangkokMonthRange(input.yearMonth)
  const isHQ = isHqAccountingStoreRow(storeFilter)
  const multi = parseCommaSeparatedStoreFilter(storeFilter)
  const selectedStoresOnly = multi && multi.length > 1 ? multi : undefined
  const allowedStoresOnly =
    !selectedStoresOnly && storeFilter === 'All' && !isHQ
      ? resolveFranchiseeAccountingAllowedStoresOnly(authScope)
      : undefined
  return { yearMonth, startStr, endStr, storeFilter, isHQ, allowedStoresOnly, selectedStoresOnly }
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
    if (excludeHqLocations && (r.location === INBOUND_HQ_LOCATION || isHqAccountingStoreRow(r.location))) continue
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

function feeAccountSubjectIdsFromMeta(
  subjectMeta: Map<number, AccountSubjectMetaRow>
): { deliveryIds: Set<number>; cardIds: Set<number>; allIds: number[] } {
  const deliveryIds = new Set<number>()
  const cardIds = new Set<number>()
  for (const [id, meta] of subjectMeta) {
    const code = String(meta.code || '').trim()
    if (code === '5528') deliveryIds.add(id)
    if (code === '5529') cardIds.add(id)
  }
  return { deliveryIds, cardIds, allIds: [...deliveryIds, ...cardIds] }
}

export async function loadAccountSubjectMeta(): Promise<Map<number, AccountSubjectMetaRow>> {
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

export async function loadItemAccountSubjectMap(): Promise<Map<string, number>> {
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
  return { isExpense: isExpenseType && !isCostSection, subjectId: sid }
}

/**
 * 패티캐시·통장 지출의 손익「비용」반영 — expense 계정 중 매출원가(cost)는 제외(매입).
 * 계정 미지정·메타 없는 id는 기존과 같이 비용(시인성).
 * 자산·부채·이체(1110) 등 type≠expense 는 비용이 아님(이체/BS — 매입으로도 넣지 않음).
 */
export function isPlExpenseAccountSubject(
  subjectId: number | null | undefined,
  accountSubjectMeta: Map<number, AccountSubjectMetaRow>
): boolean {
  const sid = subjectId != null && !isNaN(Number(subjectId)) ? Number(subjectId) : null
  if (!sid || sid <= 0) return true
  const meta = accountSubjectMeta.get(sid)
  if (!meta) return true
  if (meta.type !== 'expense') return false
  return meta.pAndLSection !== 'cost'
}

/**
 * 지출등록「배달앱/카드 수수료」(계정 5528/5529) 지급예정 — 손익 비용 반영.
 * 통장 지급 연결분은 linkedBankTransactionIds 로 넘기고 통장 집계에서 제외해 이중계상 방지.
 */
async function loadDeliveryCardFeeAccrualsForPl(params: {
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
  subjectMeta: Map<number, AccountSubjectMetaRow>
}): Promise<{
  bySubject: Map<number | null, number>
  bySubjectVat: Map<number | null, number>
  deliveryAppFees: number
  cardFees: number
  cashExpenseVat: number
  linkedBankTransactionIds: Set<number>
  fetched: number
  rows: {
    id: number
    expenseDate: string
    amount: number
    store: string | null
    memo: string | null
    accountSubjectId: number
  }[]
}> {
  const empty = {
    bySubject: new Map<number | null, number>(),
    bySubjectVat: new Map<number | null, number>(),
    deliveryAppFees: 0,
    cardFees: 0,
    cashExpenseVat: 0,
    linkedBankTransactionIds: new Set<number>(),
    fetched: 0,
    rows: [] as {
      id: number
      expenseDate: string
      amount: number
      store: string | null
      memo: string | null
      accountSubjectId: number
    }[],
  }
  const { deliveryIds, cardIds, allIds } = feeAccountSubjectIdsFromMeta(params.subjectMeta)
  if (allIds.length === 0) return empty

  try {
    const idList = allIds.join(',')
    const filter =
      `expense_date=gte.${params.startStr}&expense_date=lte.${params.endStr}` +
      `&account_subject_id=in.(${idList})&status=in.(approved,partial,paid)`
    const rows = (await supabaseSelectFilterAllPages('expense_accruals', filter, {
      select: 'id,amount,vat_amount,store_name,account_subject_id,payee_code,memo,status,expense_date',
      order: 'id.asc',
      pageSize: 2000,
      maxRows: ACCOUNTING_ROWS_MAX,
    })) as {
      id?: number
      amount?: number
      vat_amount?: number | null
      store_name?: string | null
      account_subject_id?: number | null
      payee_code?: string | null
      memo?: string | null
      status?: string | null
      expense_date?: string | null
    }[]

    const bySubject = new Map<number | null, number>()
    const bySubjectVat = new Map<number | null, number>()
    let deliveryAppFees = 0
    let cardFees = 0
    let cashExpenseVat = 0
    const accrualIds: number[] = []
    const detailRows: {
      id: number
      expenseDate: string
      amount: number
      store: string | null
      memo: string | null
      accountSubjectId: number
    }[] = []

    for (const r of rows || []) {
      const status = String(r.status || '').toLowerCase()
      // 승인·일부지급·지급완료만 손익 비용. planned(요청)는 제외.
      if (status !== 'approved' && status !== 'partial' && status !== 'paid') continue
      const storeName = String(r.store_name || '').trim()
      if (params.isHQ) {
        if (!isHqAccountingStoreRow(storeName)) continue
      } else if (params.storeFilter !== 'All') {
        if (!storeMatchesIncomeFilter(storeName, params.storeFilter)) continue
      }
      const sid =
        r.account_subject_id != null && !isNaN(Number(r.account_subject_id))
          ? Number(r.account_subject_id)
          : null
      if (sid == null || (!deliveryIds.has(sid) && !cardIds.has(sid))) continue
      if (!isPlExpenseAccountSubject(sid, params.subjectMeta)) continue

      const amt = Math.abs(Number(r.amount) || 0)
      if (!amt) continue
      const vat = safePlCashVat(amt, r.vat_amount).vat
      const accrualId = Number(r.id || 0)
      if (accrualId > 0) accrualIds.push(accrualId)

      addToSubjectMap(bySubject, sid, amt)
      if (vat > 0) {
        addToSubjectMap(bySubjectVat, sid, vat)
        cashExpenseVat += vat
      }
      if (deliveryIds.has(sid)) deliveryAppFees += amt
      else if (cardIds.has(sid)) cardFees += amt

      if (accrualId > 0) {
        detailRows.push({
          id: accrualId,
          expenseDate: String(r.expense_date || '').slice(0, 10),
          amount: amt,
          store: storeName || null,
          memo: r.memo != null ? String(r.memo) : null,
          accountSubjectId: sid,
        })
      }
    }

    const linkedBankTransactionIds = new Set<number>()
    if (accrualIds.length > 0) {
      const accrualList = accrualIds.join(',')
      const payables = (await supabaseSelectFilterAllPages(
        'payable_transactions',
        `expense_accrual_id=in.(${accrualList})&bank_transaction_id=not.is.null`,
        {
          select: 'bank_transaction_id,expense_accrual_id',
          order: 'id.asc',
          pageSize: 2000,
          maxRows: ACCOUNTING_ROWS_MAX,
        }
      )) as { bank_transaction_id?: number | null; expense_accrual_id?: number | null }[]
      for (const p of payables || []) {
        const bankId = Number(p.bank_transaction_id || 0)
        if (bankId > 0) linkedBankTransactionIds.add(bankId)
      }
    }

    return {
      bySubject,
      bySubjectVat,
      deliveryAppFees: round2(deliveryAppFees),
      cardFees: round2(cardFees),
      cashExpenseVat: round2(cashExpenseVat),
      linkedBankTransactionIds,
      fetched: rows?.length || 0,
      rows: detailRows,
    }
  } catch (e) {
    console.warn('loadDeliveryCardFeeAccrualsForPl:', e)
    return empty
  }
}

/** expense + p_and_l_section=cost → 손익「매입」 */
export function isPlCogsPurchaseAccountSubject(
  subjectId: number | null | undefined,
  accountSubjectMeta: Map<number, AccountSubjectMetaRow>
): boolean {
  const sid = subjectId != null && !isNaN(Number(subjectId)) ? Number(subjectId) : null
  if (!sid || sid <= 0) return false
  const meta = accountSubjectMeta.get(sid)
  if (!meta || meta.type !== 'expense') return false
  return meta.pAndLSection === 'cost'
}

function addPettyCashRowToPl(params: {
  row: {
    amount?: number
    vat_amount?: number | null
    trans_type?: string
    account_subject_id?: number | null
    vendor_code?: string | null
  }
  subjectMeta: Map<number, AccountSubjectMetaRow>
  purchaseVendorMap: Record<string, number>
  purchaseVendorVatMap: Record<string, number>
  expenseBySubjectMap: Map<number | null, number>
  expenseVatBySubjectMap: Map<number | null, number>
  onExpense: (amt: number) => void
  onExpenseVat?: (vat: number) => void
  onPurchase: (amt: number) => void
  onPurchaseVat?: (vat: number) => void
  onSkippedNonPl?: (amt: number) => void
}) {
  if ((params.row.trans_type || '').toLowerCase() !== 'expense') return
  const amt = Math.abs(Number(params.row.amount) || 0)
  if (!amt) return
  const vat = safePlCashVat(amt, params.row.vat_amount).vat
  if (isPlExpenseAccountSubject(params.row.account_subject_id, params.subjectMeta)) {
    params.onExpense(amt)
    addToSubjectMap(params.expenseBySubjectMap, params.row.account_subject_id, amt)
    if (vat > 0) {
      params.onExpenseVat?.(vat)
      addToSubjectMap(params.expenseVatBySubjectMap, params.row.account_subject_id, vat)
    }
    return
  }
  if (isPlCogsPurchaseAccountSubject(params.row.account_subject_id, params.subjectMeta)) {
    params.onPurchase(amt)
    const vKey = String(params.row.vendor_code || '').trim() || PL_PETTY_CASH_PURCHASE_VENDOR_KEY
    params.purchaseVendorMap[vKey] = (params.purchaseVendorMap[vKey] || 0) + amt
    if (vat > 0) {
      params.onPurchaseVat?.(vat)
      params.purchaseVendorVatMap[vKey] = (params.purchaseVendorVatMap[vKey] || 0) + vat
    }
    return
  }
  params.onSkippedNonPl?.(amt)
}

function addBankExpenseWithdrawToPl(params: {
  row: {
    amount?: number
    vat_amount?: number | null
    account_subject_id?: number | null
    vendor_code?: string | null
    memo?: string | null
  }
  subjectMeta: Map<number, AccountSubjectMetaRow>
  purchaseVendorMap: Record<string, number>
  purchaseVendorVatMap: Record<string, number>
  expenseBySubjectMap: Map<number | null, number>
  expenseVatBySubjectMap: Map<number | null, number>
  resolvedVat?: number
  onExpense: (amt: number) => void
  onExpenseVat?: (vat: number) => void
  onPurchase: (amt: number) => void
  onPurchaseVat?: (vat: number) => void
  onDeliveryFee?: (amt: number) => void
  onCardFee?: (amt: number) => void
  onSkippedNonPl?: (amt: number) => void
}) {
  const amt = Math.abs(Number(params.row.amount) || 0)
  if (!amt) return
  const vat =
    params.resolvedVat != null
      ? safePlCashVat(amt, params.resolvedVat).vat
      : safePlCashVat(amt, params.row.vat_amount).vat
  if (isPlExpenseAccountSubject(params.row.account_subject_id, params.subjectMeta)) {
    params.onExpense(amt)
    if (params.onDeliveryFee && isDeliveryAppFeeWithdrawRow(params.row)) params.onDeliveryFee(amt)
    if (params.onCardFee && isCardFeeWithdrawRow(params.row)) params.onCardFee(amt)
    addToSubjectMap(params.expenseBySubjectMap, params.row.account_subject_id, amt)
    if (vat > 0) {
      params.onExpenseVat?.(vat)
      addToSubjectMap(params.expenseVatBySubjectMap, params.row.account_subject_id, vat)
    }
    return
  }
  if (isPlCogsPurchaseAccountSubject(params.row.account_subject_id, params.subjectMeta)) {
    params.onPurchase(amt)
    const vKey = String(params.row.vendor_code || '').trim() || '__pl_vendor_unknown__'
    params.purchaseVendorMap[vKey] = (params.purchaseVendorMap[vKey] || 0) + amt
    if (vat > 0) {
      params.onPurchaseVat?.(vat)
      params.purchaseVendorVatMap[vKey] = (params.purchaseVendorVatMap[vKey] || 0) + vat
    }
    return
  }
  params.onSkippedNonPl?.(amt)
}

function mergeExpenseSubjectMaps(
  target: Map<number | null, number>,
  source: Map<number | null, number>
) {
  for (const [k, v] of source) {
    target.set(k, (target.get(k) || 0) + v)
  }
}

/** 계정별 비용 맵 합계 — 펼침 행 합과 손익 비용 총액을 일치시킴 */
export function sumExpenseSubjectAmounts(map: Map<number | null, number>): number {
  let total = 0
  for (const v of map.values()) total += Number(v) || 0
  return round2(total)
}

function buildExpenseByAccountList(
  map: Map<number | null, number>,
  meta: Map<number, AccountSubjectMetaRow>,
  vatMap?: Map<number | null, number>
): IncomeStatementReport['expenseByAccountSubject'] {
  const rows: NonNullable<IncomeStatementReport['expenseByAccountSubject']> = []
  for (const [sid, amt] of map) {
    if (!amt) continue
    const vatAmt = Math.max(0, Number(vatMap?.get(sid)) || 0)
    if (sid == null) {
      rows.push({
        accountSubjectId: null,
        code: '',
        name: '',
        nameEn: null,
        nameTh: null,
        amount: amt,
        ...(vatAmt > 0 ? { vatAmount: round2(vatAmt) } : {}),
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
      ...(vatAmt > 0 ? { vatAmount: round2(vatAmt) } : {}),
    })
  }
  rows.sort((a, b) => b.amount - a.amount)
  return rows
}

/** 승인 회계 PO 가맹 청구 — 계정과목 펼침에 보이도록 합성 행 추가(5528 플랫폼 수수료와 분리) */
function appendFranchiseBillingExpenseSubjects(
  rows: NonNullable<IncomeStatementReport['expenseByAccountSubject']> | undefined,
  franchise: FranchiseBillingPlSlice
): NonNullable<IncomeStatementReport['expenseByAccountSubject']> {
  const base = [...(rows || [])]
  const extras: NonNullable<IncomeStatementReport['expenseByAccountSubject']> = []
  const push = (
    code: string,
    amount: number,
    name: string,
    nameEn: string,
    nameTh: string
  ) => {
    if (amount <= 0) return
    extras.push({
      accountSubjectId: null,
      code,
      name,
      nameEn,
      nameTh,
      amount: round2(amount),
    })
  }
  push(
    PL_FRANCHISE_EXPENSE_SUBJECT_CODES.royalty,
    franchise.royaltyGross,
    '본사 로열티 청구 (승인 회계 PO)',
    'HQ royalty billing (approved accounting PO)',
    'ค่าสิทธิ์จากสำนักงานใหญ่ (PO บัญชีที่อนุมัติ)'
  )
  push(
    PL_FRANCHISE_EXPENSE_SUBJECT_CODES.deliveryGp,
    franchise.deliveryGpGross,
    '본사 배달 GP 청구 (승인 회계 PO)',
    'HQ delivery GP billing (approved accounting PO)',
    'Delivery GP จากสำนักงานใหญ่ (PO ที่อนุมัติ)'
  )
  push(
    PL_FRANCHISE_EXPENSE_SUBJECT_CODES.grabGp,
    franchise.grabGpGross,
    '본사 Grab GP 청구 (승인 회계 PO·추가 %)',
    'HQ Grab GP billing (approved PO · extra %)',
    'Grab GP จากสำนักงานใหญ่ (PO ที่อนุมัติ · % เพิ่ม)'
  )
  push(
    PL_FRANCHISE_EXPENSE_SUBJECT_CODES.combined,
    franchise.combinedGross,
    '본사 가맹 청구 합산 (승인 회계 PO)',
    'HQ franchise billing combined (approved PO)',
    'เรียกเก็บแฟรนไชส์รวม (PO ที่อนุมัติ)'
  )
  if (extras.length === 0) return base
  return [...base, ...extras].sort((a, b) => b.amount - a.amount)
}

function isExcludedHqStockLocation(location: string): boolean {
  const n = String(location || '').trim().toLowerCase()
  if (!n) return true
  if (n === INBOUND_HQ_LOCATION.toLowerCase()) return true
  return isHqAccountingStoreRow(location)
}

async function resolveInventoryLocationPatterns(
  locationFilter: string | null,
  excludeHq: boolean,
  tenantId?: string
): Promise<string[]> {
  if (locationFilter) return getStockLocationPatterns(locationFilter)
  if (!excludeHq) return []
  try {
    const rows = (await supabaseRpc<{ location: string }[]>('get_distinct_stock_locations', {
      ...(tenantId ? { p_tenant_id: tenantId } : {}),
    })) as
      | { location?: string }[]
      | null
    const patterns = (rows || [])
      .map((r) => String(r.location || '').trim())
      .filter((loc) => loc && !isExcludedHqStockLocation(loc))
    // 빈 패턴이면 RPC/fallback이 전 location을 읽어버리는 것을 방지
    return patterns.length > 0 ? patterns : ['__pl_no_store_locations__']
  } catch {
    return ['__pl_no_store_locations__']
  }
}

/** get_store_stock RPC 우선, 미배포 시 getAppData와 동일한 select fallback */
async function fetchStoreStockQtyByItem(
  locationPatterns: string[],
  asOfUtcIso: string,
  tenantId?: string
): Promise<Record<string, number>> {
  if (locationPatterns.length === 0) return {}
  try {
    const rows = (await supabaseRpc<{ item_code: string; total_qty: number }[]>('get_store_stock', {
      p_location_patterns: locationPatterns,
      p_as_of_date: asOfUtcIso,
      ...(tenantId ? { p_tenant_id: tenantId } : {}),
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
    const tenantScope = { enforce: Boolean(tenantId), tenantId: tenantId || '' }
    const rows = (await supabaseSelectFilterAllPages('stock_logs', appendInventoryTenantFilter(`${locFilter}${dateSuffix}`, tenantScope), {
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
  excludeHq = false,
  tenantId?: string
): Promise<NetVatBuckets> {
  const buckets = emptyNetVatBuckets()
  const asOfUtcIso = resolveInventoryAsOfUtcIso(cutoffDate, isBefore)
  const locationPatterns = await resolveInventoryLocationPatterns(locationFilter, excludeHq, tenantId)
  const byItem = await fetchStoreStockQtyByItem(locationPatterns, asOfUtcIso, tenantId)
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
    if (excludeHqLocations && (r.location === INBOUND_HQ_LOCATION || isHqAccountingStoreRow(r.location))) continue
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
  isHQ: boolean,
  subjectMeta: Map<number, AccountSubjectMetaRow>
): Promise<{ total: number; byAccountSubjectId: Map<number | null, number> }> {
  const byAccountSubjectId = new Map<number | null, number>()
  const empty = { total: 0, byAccountSubjectId }
  try {
    const entries = (await supabaseSelectFilter(
      'depreciation_entries',
      `year_month=eq.${encodeURIComponent(yearMonth)}`,
      { select: 'amount,fixed_asset_id', limit: 5000 }
    )) as { amount?: number; fixed_asset_id?: number }[] | null
    if (!entries?.length) return empty
    const assetIds = [
      ...new Set(entries.map((e) => e.fixed_asset_id).filter((id): id is number => id != null)),
    ]
    if (assetIds.length === 0) return empty
    const assets = (await supabaseSelectFilter(
      'fixed_assets',
      `id=in.(${assetIds.join(',')})`,
      { select: 'id,store_name,depreciation_expense_account_code', limit: 5000 }
    )) as { id?: number; store_name?: string; depreciation_expense_account_code?: string | null }[] | null
    const storeByAsset = new Map<number, string>()
    const expenseCodeByAsset = new Map<number, string>()
    for (const a of assets || []) {
      if (a.id == null) continue
      storeByAsset.set(a.id, String(a.store_name || '').trim())
      expenseCodeByAsset.set(a.id, String(a.depreciation_expense_account_code || '5500').trim() || '5500')
    }
    const codeToSubjectId = new Map<string, number>()
    for (const [id, meta] of subjectMeta) {
      const code = String(meta.code || '').trim()
      if (code) codeToSubjectId.set(code, id)
    }
    let sum = 0
    for (const e of entries) {
      const aid = e.fixed_asset_id
      if (aid == null) continue
      const st = storeByAsset.get(aid) || ''
      if (isHQ) {
        if (st && !isHqAccountingStoreRow(st)) continue
      } else if (storeFilter !== 'All') {
        if (st && !storeMatchesIncomeFilter(st, storeFilter)) continue
      }
      const amt = Math.abs(Number(e.amount) || 0)
      if (!amt) continue
      sum += amt
      const code = expenseCodeByAsset.get(aid) || '5500'
      const sid = codeToSubjectId.get(code) ?? null
      byAccountSubjectId.set(sid, (byAccountSubjectId.get(sid) || 0) + amt)
    }
    return { total: round2(sum), byAccountSubjectId }
  } catch {
    return empty
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
  const rollupStores = resolveAccountingRollupStores(scope)
  if (rollupStores && rollupStores.length > 1) {
    const perStore = await Promise.all(
      rollupStores.map((store) =>
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
  let purchasesBankVat = 0
  let cashExpenseVat = 0
  const bankPurchaseVendorKeys = new Set<string>()
  let pettyCashExpense = 0
  let bankWithdrawExpense = 0
  let deliveryAppFeeExpense = 0
  let cardFeeExpense = 0
  let fixedExpenses = 0
  let stockInboundExpense = 0
  let payrollExpense = 0
  let payrollCashDeduped = 0
  let skippedNonPlExpense = 0
  let bankCategoryFixedExpense = 0
  let beginningInventory = 0
  let endingInventory = 0
  const expenseBySubjectMap = new Map<number | null, number>()
  const expenseVatBySubjectMap = new Map<number | null, number>()
  const purchaseVendorVatMapAccum: Record<string, number> = {}

  const payrollAgg = await loadPayrollAggregateForIncomeStatement({
    yearMonth,
    storeFilter,
    isHQ,
    subjectMeta,
  })
  if (payrollAgg.total > 0) {
    payrollExpense = payrollAgg.total
    addToSubjectMap(expenseBySubjectMap, payrollAgg.preferredSubjectId, payrollAgg.total)
  }
  const payrollPayWindowEndStr = plFetchEndStrWithPayrollPayWindow(endStr)

  const feeAccrualPl = await loadDeliveryCardFeeAccrualsForPl({
    startStr,
    endStr,
    storeFilter,
    isHQ,
    subjectMeta,
  })
  mergeExpenseSubjectMaps(expenseBySubjectMap, feeAccrualPl.bySubject)
  mergeExpenseSubjectMaps(expenseVatBySubjectMap, feeAccrualPl.bySubjectVat)
  cashExpenseVat += feeAccrualPl.cashExpenseVat
  deliveryAppFeeExpense += feeAccrualPl.deliveryAppFees
  cardFeeExpense += feeAccrualPl.cardFees
  const feeAccrualLinkedBankIds = feeAccrualPl.linkedBankTransactionIds
  const feeAccountSubjectIds = new Set(feeAccountSubjectIdsFromMeta(subjectMeta).allIds)
  limits.delivery_card_fee_accruals = {
    fetched: feeAccrualPl.fetched,
    limit: ACCOUNTING_ROWS_MAX,
  }

  const franchiseBillingPl = await loadFranchiseBillingForIncomeStatement({
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    isHQ,
  })
  limits.franchise_billing_pos = {
    fetched: franchiseBillingPl.fetched,
    limit: ACCOUNTING_ROWS_MAX,
  }
  const franchiseExpense: FranchiseBillingPlSlice = franchiseBillingPl.expense
  const franchiseRevenue: FranchiseBillingPlSlice = franchiseBillingPl.revenue

  const classifySalaryCashForPl = (row: {
    account_subject_id?: number | null
    memo?: string | null
    amount?: number
    trans_date?: string | null
    expense_date?: string | null
  }) => {
    const decision = resolveSalaryCashPlDecision({
      isSalaryLike: isSalaryLikePlExpenseRow({
        accountSubjectId: row.account_subject_id,
        memo: row.memo,
        subjectMeta,
        salarySubjectIds: payrollAgg.salarySubjectIds,
      }),
      payrollExpenseThisMonth: payrollExpense,
      transDate: row.trans_date,
      expenseDate: row.expense_date,
      plYearMonth: yearMonth,
    })
    if (decision === 'skip-payroll-dup') {
      payrollCashDeduped += Math.abs(Number(row.amount) || 0)
    }
    return decision
  }

  let ordersPurchaseSubtotal = 0
  let purchaseByVendor: IncomeStatementLineDetail[] = []
  let salesByCustomer: IncomeStatementLineDetail[] = []
  let salesByDay: IncomeStatementLineDetail[] = []
  let purchaseHqOutboundBasis:
    | { outboundTotal: number; approvedOrdersTotal: number; diff: number }
    | undefined = undefined
  let hqOutboundDuplicateLinesDeduped = 0
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

    const [inboundHq, vendorPurchaseKeyIndex] = await Promise.all([
      getDirectInboundPurchasesByVendor(
        '입고등록',
        startStr,
        endStr,
        itemUnitCostMap,
        {},
        itemAccountSubjectMap,
        subjectMeta
      ),
      loadVendorPurchaseKeyIndex(),
    ])
    const inboundByVendorHq = normalizeVendorAmountMap(inboundHq.byVendor, vendorPurchaseKeyIndex)
    const bankPayHqFetch = await fetchBankPurchasePaymentsByVendor({
      isHQ: true,
      storeFilter,
      startStr,
      endStr,
    })
    limits.bank_purchase_payment = {
      fetched: bankPayHqFetch.fetched,
      limit: ACCOUNTING_ROWS_MAX,
    }
    if (bankPayHqFetch.truncated) {
      warnings.push(
        `통장 매입지급 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 매입이 과소할 수 있습니다.`
      )
    }
    const bankPayByVendorHqNorm = normalizeVendorAmountMap(bankPayHqFetch.byVendor, vendorPurchaseKeyIndex)
    const bankPayVatHqNorm = normalizeVendorAmountMap(bankPayHqFetch.byVendorVat, vendorPurchaseKeyIndex)
    purchaseInboundBankOverlapVendorKeys = collectInboundBankOverlapVendorKeys(
      inboundByVendorHq,
      bankPayByVendorHqNorm
    )
    const bankPayByVendorHq = excludeBankPurchasesWhenDirectInboundPresent(
      inboundByVendorHq,
      bankPayByVendorHqNorm
    )
    const bankPayVatByVendorHq = pickVendorVatForKeptAmounts(bankPayVatHqNorm, bankPayByVendorHq)
    const purchaseVendorMapHq: Record<string, number> = { ...inboundByVendorHq }
    mergeVendorAmountMap(purchaseVendorMapHq, bankPayByVendorHq)
    mergeVendorAmountMap(purchaseVendorVatMapAccum, bankPayVatByVendorHq)
    /** 거래처별: 직접입고(발생) + 통장 매입지급(입고 없는 거래처만) */
    const inboundHqTotal = Object.values(inboundByVendorHq).reduce((a, b) => a + b, 0)
    const bankHqTotal = Object.values(bankPayByVendorHq).reduce((a, b) => a + b, 0)
    for (const k of Object.keys(bankPayByVendorHq)) bankPurchaseVendorKeys.add(k)
    purchasesStockNet += inboundHqTotal
    purchasesBankGross += bankHqTotal
    purchasesBankVat += sumVendorMap(bankPayVatByVendorHq)
    purchases += inboundHqTotal + bankHqTotal
    mergeExpenseSubjectMaps(expenseBySubjectMap, inboundHq.expenseBySubject)
    stockInboundExpense += sumExpenseSubjectAmounts(inboundHq.expenseBySubject)

    const pettyAll = (await supabaseSelectFilterAllPages(
      'petty_cash_transactions',
      `trans_date=gte.${startStr}&trans_date=lte.${payrollPayWindowEndStr}&trans_type=eq.expense`,
      {
        select: 'store,amount,vat_amount,trans_type,account_subject_id,vendor_code,memo,trans_date',
        order: 'id.asc',
        pageSize: 8000,
        maxRows: ACCOUNTING_ROWS_MAX,
      }
    )) as {
      store?: string
      amount?: number
      vat_amount?: number | null
      trans_type?: string
      account_subject_id?: number | null
      vendor_code?: string | null
      memo?: string | null
      trans_date?: string | null
    }[]
    for (const r of pettyAll || []) {
      const st = String(r.store || '').trim()
      if (!isHqAccountingStoreRow(st)) continue
      const salaryDecision = classifySalaryCashForPl(r)
      if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
      if (salaryDecision === 'not-salary') {
        const td = String(r.trans_date || '').slice(0, 10)
        if (td < startStr || td > endStr) continue
      }
      addPettyCashRowToPl({
        row: r,
        subjectMeta,
        purchaseVendorMap: purchaseVendorMapHq,
        purchaseVendorVatMap: purchaseVendorVatMapAccum,
        expenseBySubjectMap,
        expenseVatBySubjectMap,
        onExpense: (amt) => {
          pettyCashExpense += amt
        },
        onExpenseVat: (vat) => {
          cashExpenseVat += vat
        },
        onPurchase: (amt) => {
          purchasesBankGross += amt
          purchases += amt
        },
        onPurchaseVat: (vat) => {
          purchasesBankVat += vat
        },
        onSkippedNonPl: (amt) => {
          skippedNonPlExpense += amt
        },
      })
    }
    limits.petty_cash = { fetched: pettyAll?.length || 0, limit: ACCOUNTING_ROWS_MAX }
    if ((pettyAll?.length || 0) >= ACCOUNTING_ROWS_MAX) {
      warnings.push(`패티캐시 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 비용이 과소할 수 있습니다.`)
    }

    try {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as { id?: number; store?: string }[] | null
      const hqAccountIds = (bankAccRows || [])
        .filter((a) => isHqAccountingStoreRow(String(a.store || '')))
        .map((a) => a.id)
        .filter((id): id is number => id != null)
      if (hqAccountIds.length > 0) {
        const { rows: btRows, fetched, truncated } = await fetchBankWithdrawRowsForPl(
          hqAccountIds,
          startStr,
          payrollPayWindowEndStr,
          { feeAccountSubjectIds }
        )
        const accrualVatByBank = await loadExpenseAccrualVatByBankIds(
          btRows.map((r) => Number(r.id || 0)).filter((id) => id > 0)
        )
        for (const r of btRows) {
          const bankId = Number(r.id || 0)
          if (bankId > 0 && feeAccrualLinkedBankIds.has(bankId)) continue
          const cat = String(r.category || 'expense').toLowerCase()
          if (['transfer', 'correction', 'loan', 'advance', 'unclassified', 'purchase_payment'].includes(cat)) continue
          const salaryDecision = classifySalaryCashForPl(r)
          if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
          if (salaryDecision === 'not-salary') {
            if (!bankExpenseInPlPeriod(String(r.trans_date || ''), r.expense_date, startStr, endStr)) continue
          }
          if (cat === 'fixed') bankCategoryFixedExpense += Math.abs(Number(r.amount) || 0)
          const accrual = bankId > 0 ? accrualVatByBank.get(bankId) : undefined
          const resolved = resolveBankPlCashVat({
            bankAmount: Number(r.amount) || 0,
            bankVatAmount: r.vat_amount,
            accrualGross: accrual?.gross,
            accrualVat: accrual?.vat,
          })
          addBankExpenseWithdrawToPl({
            row: r,
            subjectMeta,
            purchaseVendorMap: purchaseVendorMapHq,
            purchaseVendorVatMap: purchaseVendorVatMapAccum,
            expenseBySubjectMap,
            expenseVatBySubjectMap,
            resolvedVat: resolved.vat,
            onExpense: (amt) => {
              bankWithdrawExpense += amt
            },
            onExpenseVat: (vat) => {
              cashExpenseVat += vat
            },
            onPurchase: (amt) => {
              purchasesBankGross += amt
              purchases += amt
            },
            onPurchaseVat: (vat) => {
              purchasesBankVat += vat
            },
            onDeliveryFee: (amt) => {
              deliveryAppFeeExpense += amt
            },
            onCardFee: (amt) => {
              cardFeeExpense += amt
            },
            onSkippedNonPl: (amt) => {
              skippedNonPlExpense += amt
            },
          })
        }
        limits.bank_withdraw = { fetched, limit: ACCOUNTING_ROWS_MAX }
        if (truncated) {
          warnings.push(
            `통장 출금 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 비용이 과소할 수 있습니다.`
          )
        }
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
      .map(([key, amount]) => {
        const vat = Math.max(0, Number(purchaseVendorVatMapAccum[key]) || 0)
        return vat > 0 ? { key, amount, vatAmount: round2(vat) } : { key, amount }
      })
      .sort((a, b) => b.amount - a.amount)
  } else {
    const posSalesSum = await sumCompletedPosSalesTotal({
      startStr,
      endStr,
      storeFilter,
      tenantId: input.tenantId,
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
    const [orders, hqVendorIndex, vendorPurchaseKeyIndexStore] = await Promise.all([
      supabaseSelectFilterAllPages('orders', orderFilter, {
        select: 'total',
        pageSize: 8000,
        maxRows: ACCOUNTING_ROWS_MAX,
      }) as Promise<{ total?: number }[]>,
      loadHqVendorMatchIndex(),
      loadVendorPurchaseKeyIndex(),
    ])
    let hqOutboundAgg: {
      purchaseTotal: number
      expenseBySubject: Map<number | null, number>
      truncated?: boolean
      dedupedDuplicateCount?: number
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
    limits.orders_purchase = { fetched: orders.length, limit: ACCOUNTING_ROWS_MAX }
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
    if ((hqOutboundAgg.dedupedDuplicateCount || 0) > 0) {
      hqOutboundDuplicateLinesDeduped = hqOutboundAgg.dedupedDuplicateCount || 0
      warnings.push(
        `본사 창고 출고 중복 stock_logs ${hqOutboundDuplicateLinesDeduped}건을 손익 매입에서 제외했습니다. (동일 발주 수령 이중 기록 가능)`
      )
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
    const bankPayStoreFetch = await fetchBankPurchasePaymentsByVendor({
      isHQ: false,
      storeFilter,
      startStr,
      endStr,
    })
    limits.bank_purchase_payment = {
      fetched: bankPayStoreFetch.fetched,
      limit: ACCOUNTING_ROWS_MAX,
    }
    if (bankPayStoreFetch.truncated) {
      warnings.push(
        `통장 매입지급 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 매입이 과소할 수 있습니다.`
      )
    }
    const bankPayByVendorStorePreHq: Record<string, number> = {}
    const bankPayVatByVendorStorePreHq: Record<string, number> = {}
    for (const [k, v] of Object.entries(bankPayStoreFetch.byVendor)) {
      const amt = Number(v) || 0
      if (amt <= 0) continue
      if (isHqVendorPurchaseKey(k, hqVendorIndex)) {
        excludedHqVendorDupRaw.push({ key: k, amount: amt })
        continue
      }
      bankPayByVendorStorePreHq[k] = amt
      const vat = Number(bankPayStoreFetch.byVendorVat[k]) || 0
      if (vat > 0) bankPayVatByVendorStorePreHq[k] = vat
    }
    const inboundByVendorStoreNorm = normalizeVendorAmountMap(inboundByVendorStore, vendorPurchaseKeyIndexStore)
    const bankPayByVendorStoreNorm = normalizeVendorAmountMap(
      bankPayByVendorStorePreHq,
      vendorPurchaseKeyIndexStore
    )
    const bankPayVatByVendorStoreNorm = normalizeVendorAmountMap(
      bankPayVatByVendorStorePreHq,
      vendorPurchaseKeyIndexStore
    )
    purchaseInboundBankOverlapVendorKeys = collectInboundBankOverlapVendorKeys(
      inboundByVendorStoreNorm,
      bankPayByVendorStoreNorm
    )
    const bankPayByVendorStore = excludeBankPurchasesWhenDirectInboundPresent(
      inboundByVendorStoreNorm,
      bankPayByVendorStoreNorm
    )
    const bankPayVatByVendorStore = pickVendorVatForKeptAmounts(
      bankPayVatByVendorStoreNorm,
      bankPayByVendorStore
    )
    const purchaseVendorMapStore: Record<string, number> = { ...inboundByVendorStoreNorm }
    mergeVendorAmountMap(purchaseVendorMapStore, bankPayByVendorStore)
    mergeVendorAmountMap(purchaseVendorVatMapAccum, bankPayVatByVendorStore)
    /** 본사 창고 출고 + 거래처별(직접입고 + 통장 매입지급, 본사 법인 제외) — 펼침 합계와 매입 총액 일치 */
    const inboundStoreTotal = Object.values(inboundByVendorStoreNorm).reduce((a, b) => a + b, 0)
    const bankStoreTotal = Object.values(bankPayByVendorStore).reduce((a, b) => a + b, 0)
    for (const k of Object.keys(bankPayByVendorStore)) bankPurchaseVendorKeys.add(k)
    purchasesStockNet += ordersPurchaseSubtotal + inboundStoreTotal
    purchasesBankGross += bankStoreTotal
    purchasesBankVat += sumVendorMap(bankPayVatByVendorStore)
    purchases += ordersPurchaseSubtotal + inboundStoreTotal + bankStoreTotal
    mergeExpenseSubjectMaps(expenseBySubjectMap, inboundStore.expenseBySubject)
    stockInboundExpense += sumExpenseSubjectAmounts(inboundStore.expenseBySubject)

    let pettyFilter = `trans_date=gte.${startStr}&trans_date=lte.${payrollPayWindowEndStr}&trans_type=eq.expense`
    if (storeFilter !== 'All') {
      pettyFilter += `&${buildStoreFieldOrIlikeFragment('store', storeFilter)}`
    }
    const pettyRows = (await supabaseSelectFilterAllPages('petty_cash_transactions', pettyFilter, {
      select: 'amount,vat_amount,trans_type,account_subject_id,vendor_code,memo,trans_date',
      order: 'id.asc',
      pageSize: 8000,
      maxRows: ACCOUNTING_ROWS_MAX,
    })) as {
      amount?: number
      vat_amount?: number | null
      trans_type?: string
      account_subject_id?: number | null
      vendor_code?: string | null
      memo?: string | null
      trans_date?: string | null
    }[]
    for (const r of pettyRows || []) {
      const salaryDecision = classifySalaryCashForPl(r)
      if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
      if (salaryDecision === 'not-salary') {
        const td = String(r.trans_date || '').slice(0, 10)
        if (td < startStr || td > endStr) continue
      }
      addPettyCashRowToPl({
        row: r,
        subjectMeta,
        purchaseVendorMap: purchaseVendorMapStore,
        purchaseVendorVatMap: purchaseVendorVatMapAccum,
        expenseBySubjectMap,
        expenseVatBySubjectMap,
        onExpense: (amt) => {
          pettyCashExpense += amt
        },
        onExpenseVat: (vat) => {
          cashExpenseVat += vat
        },
        onPurchase: (amt) => {
          purchasesBankGross += amt
          purchases += amt
        },
        onPurchaseVat: (vat) => {
          purchasesBankVat += vat
        },
        onSkippedNonPl: (amt) => {
          skippedNonPlExpense += amt
        },
      })
    }
    limits.petty_cash = { fetched: pettyRows?.length || 0, limit: ACCOUNTING_ROWS_MAX }
    if ((pettyRows?.length || 0) >= ACCOUNTING_ROWS_MAX) {
      warnings.push(`패티캐시 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 비용이 과소할 수 있습니다.`)
    }

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
        const { rows: btRows, fetched, truncated } = await fetchBankWithdrawRowsForPl(
          accountIds,
          startStr,
          payrollPayWindowEndStr,
          { feeAccountSubjectIds }
        )
        const accrualVatByBank = await loadExpenseAccrualVatByBankIds(
          btRows.map((r) => Number(r.id || 0)).filter((id) => id > 0)
        )
        for (const r of btRows) {
          const bankId = Number(r.id || 0)
          if (bankId > 0 && feeAccrualLinkedBankIds.has(bankId)) continue
          const cat = String(r.category || 'expense').toLowerCase()
          if (['transfer', 'correction', 'loan', 'advance', 'unclassified', 'purchase_payment'].includes(cat)) continue
          const salaryDecision = classifySalaryCashForPl(r)
          if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
          if (salaryDecision === 'not-salary') {
            if (!bankExpenseInPlPeriod(String(r.trans_date || ''), r.expense_date, startStr, endStr)) continue
          }
          if (cat === 'fixed') bankCategoryFixedExpense += Math.abs(Number(r.amount) || 0)
          const accrual = bankId > 0 ? accrualVatByBank.get(bankId) : undefined
          const resolved = resolveBankPlCashVat({
            bankAmount: Number(r.amount) || 0,
            bankVatAmount: r.vat_amount,
            accrualGross: accrual?.gross,
            accrualVat: accrual?.vat,
          })
          addBankExpenseWithdrawToPl({
            row: r,
            subjectMeta,
            purchaseVendorMap: purchaseVendorMapStore,
            purchaseVendorVatMap: purchaseVendorVatMapAccum,
            expenseBySubjectMap,
            expenseVatBySubjectMap,
            resolvedVat: resolved.vat,
            onExpense: (amt) => {
              bankWithdrawExpense += amt
            },
            onExpenseVat: (vat) => {
              cashExpenseVat += vat
            },
            onPurchase: (amt) => {
              purchasesBankGross += amt
              purchases += amt
            },
            onPurchaseVat: (vat) => {
              purchasesBankVat += vat
            },
            onDeliveryFee: (amt) => {
              deliveryAppFeeExpense += amt
            },
            onCardFee: (amt) => {
              cardFeeExpense += amt
            },
            onSkippedNonPl: (amt) => {
              skippedNonPlExpense += amt
            },
          })
        }
        limits.bank_withdraw = { fetched, limit: ACCOUNTING_ROWS_MAX }
        if (truncated) {
          warnings.push(
            `통장 출금 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 비용이 과소할 수 있습니다.`
          )
        }
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
      if (amount > 0) {
        const vat = Math.max(0, Number(purchaseVendorVatMapAccum[key]) || 0)
        purchaseByVendor.push(
          vat > 0 ? { key, amount, vatAmount: round2(vat) } : { key, amount }
        )
      }
    }
    purchaseByVendor.sort((a, b) => b.amount - a.amount)
  }

  // 승인 회계 PO(로열티·배달/Grab GP) — 발행측 매출 (displayAmounts는 VAT 버킷 확정 후 가산)
  if (franchiseRevenue.totalGross > 0 || franchiseRevenue.totalNet > 0) {
    sales += franchiseRevenue.totalGross
    // 매장 POS 일별(salesByDay) 우선권을 깨지 않도록 본사(또는 이미 매출처 분해)일 때만 행 추가
    if (isHQ || salesByCustomer.length > 0) {
      salesByCustomer = [
        ...salesByCustomer,
        {
          key: PL_FRANCHISE_BILLING_SALES_KEY,
          amount: franchiseRevenue.totalGross,
          amountBasis: 'pos_gross' as const,
        },
      ]
    }
  }

  if (input.includeDebug) {
    try {
      const countFilter =
        isHQ
          ? `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
          : `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
      const pettyTotalCount = await supabaseCountFilter('petty_cash_transactions', countFilter)
      if (limits.petty_cash) limits.petty_cash.total = pettyTotalCount
    } catch {
      // ignore diagnostics errors
    }
  }

  if (payrollCashDeduped > 0) {
    warnings.push(
      `확정 급여(근태 귀속월)가 손익에 반영되어, 익월 지급분 통장·패티 급여성 출금 약 ฿${Math.round(payrollCashDeduped).toLocaleString('en-US')}은 이중 방지를 위해 제외했습니다.`
    )
  }
  if (skippedNonPlExpense > 0) {
    warnings.push(
      `손익 제외(이체·자산·부채 등 비비용 계정) 출금 약 ฿${Math.round(skippedNonPlExpense).toLocaleString('en-US')} — 통장 용도·계정을 확인하세요.`
    )
  }
  if (bankCategoryFixedExpense > 0 && fixedExpenses > 0) {
    warnings.push(
      `통장 용도「고정비」출금(약 ฿${Math.round(bankCategoryFixedExpense).toLocaleString('en-US')})과 고정비 월정액(฿${Math.round(fixedExpenses).toLocaleString('en-US')})이 함께 반영되어 이중일 수 있습니다.`
    )
  }

  const depAgg = await sumDepreciationForIncomeStatement(yearMonth, storeFilter, isHQ, subjectMeta)
  const depreciationExpense = depAgg.total
  if (depreciationExpense > 0) {
    mergeExpenseSubjectMaps(expenseBySubjectMap, depAgg.byAccountSubjectId)
  }

  const expenseByAccountSubject = appendFranchiseBillingExpenseSubjects(
    buildExpenseByAccountList(expenseBySubjectMap, subjectMeta, expenseVatBySubjectMap),
    franchiseExpense
  )
  /** petty·통장·고정비·급여·감가상각·입고(비용 계정 품목) 등 + 승인 회계 PO 가맹 청구 */
  const expensesFromSubjects = sumExpenseSubjectAmounts(expenseBySubjectMap)
  const franchiseRoyaltyExpense = franchiseExpense.royaltyGross
  const franchiseDeliveryGpExpense = franchiseExpense.deliveryGpGross
  const franchiseGrabGpExpense = franchiseExpense.grabGpGross
  const franchiseBillingCombinedExpense = franchiseExpense.combinedGross
  const franchiseBillingExpenseGross = franchiseExpense.totalGross
  const franchiseBillingExpenseNet = franchiseExpense.totalNet
  const expenses = round2(expensesFromSubjects + franchiseBillingExpenseGross)
  const cogs = beginningInventory + purchases - endingInventory
  const grossProfit = sales - cogs
  const netProfit = grossProfit - expenses

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
    !isHQ && storeFilter === 'All',
    input.tenantId
  )
  const endInvBuckets = await getInventoryVatBuckets(
    isHQ ? '본사' : storeFilter !== 'All' ? storeFilter : null,
    endStr,
    false,
    itemUnitCostMap,
    itemTaxMap,
    !isHQ && storeFilter === 'All',
    input.tenantId
  )

  if (isHQ) {
    salesNetForDisplay = netTotalFromBuckets(salesStockVatBuckets)
    salesGrossForDisplay = grossFromNetVatBuckets(salesStockVatBuckets)
  }
  // 승인 회계 PO 가맹 청구 매출(발행측) — 물류 출고 VAT 버킷과 별도 가산
  if (franchiseRevenue.totalGross > 0 || franchiseRevenue.totalNet > 0) {
    salesGrossForDisplay = round2(salesGrossForDisplay + franchiseRevenue.totalGross)
    salesNetForDisplay = round2(salesNetForDisplay + franchiseRevenue.totalNet)
  }
  if (salesNetForDisplay <= 0 && sales > 0) {
    salesNetForDisplay = sales
    salesGrossForDisplay = salesGrossForDisplay > 0 ? salesGrossForDisplay : sales
  }
  if (salesGrossForDisplay <= 0 && sales > 0) salesGrossForDisplay = sales

  const purchasesBankVatRounded = round2(purchasesBankVat)
  const purchasesNetForDisplay = round2(
    purchasesStockNet + Math.max(0, purchasesBankGross - purchasesBankVatRounded)
  )
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
    franchiseBillingGross: franchiseBillingExpenseGross,
    franchiseBillingNet: franchiseBillingExpenseNet,
    franchiseRoyaltyGross: franchiseExpense.royaltyGross,
    franchiseRoyaltyNet: franchiseExpense.royaltyNet,
    franchiseDeliveryGpGross: franchiseExpense.deliveryGpGross,
    franchiseDeliveryGpNet: franchiseExpense.deliveryGpNet,
    franchiseGrabGpGross: franchiseExpense.grabGpGross,
    franchiseGrabGpNet: franchiseExpense.grabGpNet,
    franchiseBillingCombinedGross: franchiseExpense.combinedGross,
    franchiseBillingCombinedNet: franchiseExpense.combinedNet,
    franchiseRevenueGross: franchiseRevenue.totalGross,
    franchiseRevenueNet: franchiseRevenue.totalNet,
    expensesCashVat: round2(cashExpenseVat),
    purchasesBankVat: purchasesBankVatRounded,
    ...(isHQ ? { salesStockVatBuckets } : {}),
    purchasesStockVatBuckets,
  }

  const depreciation = depreciationExpense
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
      stockInboundExpense: round2(stockInboundExpense),
      payrollExpense: round2(payrollExpense),
      depreciationExpense: round2(depreciationExpense),
      franchiseRoyalty: round2(franchiseRoyaltyExpense),
      franchiseDeliveryGp: round2(franchiseDeliveryGpExpense),
      franchiseGrabGp: round2(franchiseGrabGpExpense),
      franchiseBillingCombined: round2(franchiseBillingCombinedExpense),
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
      hqOutboundDuplicateLinesDeduped > 0 ||
      (purchaseExcludedHqBankPayments?.length ?? 0) > 0
        ? {
            warnings,
            limits,
            ...(purchaseInboundBankOverlapVendorKeys.length > 0
              ? { purchaseInboundBankOverlapVendorKeys }
              : {}),
            ...(purchaseHqOutboundBasis ? { purchaseHqOutboundBasis } : {}),
            ...(hqOutboundDuplicateLinesDeduped > 0 ? { hqOutboundDuplicateLinesDeduped } : {}),
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

export type IncomeStatementPurchaseDrillPettyRow = {
  kind: 'petty'
  id: number
  transDate: string
  amount: number
  store: string | null
  memo: string | null
  accountSubjectId: number | null
  accountSubjectCode: string | null
  accountSubjectName: string | null
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
  pettyCash: IncomeStatementPurchaseDrillPettyRow[]
  truncated: { inbound: boolean; bank: boolean; orders: boolean; petty: boolean }
}

function drillVendorMatchesInboundRow(
  vendorKey: string,
  vendorTarget: string | null | undefined,
  vendorPurchaseKeyIndex: VendorPurchaseKeyIndex
): boolean {
  return purchaseVendorKeyMatchesRaw(vendorKey, vendorTarget, vendorPurchaseKeyIndex)
}

function drillVendorMatchesBankRow(
  vendorKey: string,
  vendorCode: string | null | undefined,
  vendorPurchaseKeyIndex: VendorPurchaseKeyIndex
): boolean {
  return purchaseVendorKeyMatchesRaw(vendorKey, vendorCode, vendorPurchaseKeyIndex)
}

async function listPettyCashPurchaseDrillRows(params: {
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
  subjectMeta: Map<number, AccountSubjectMetaRow>
  /** 미지정 시 거래처 없는 패티 매입만 */
  vendorKey?: string
  vendorPurchaseKeyIndex?: VendorPurchaseKeyIndex
}): Promise<{ rows: IncomeStatementPurchaseDrillPettyRow[]; truncated: boolean }> {
  let pettyFilter = `trans_date=gte.${params.startStr}&trans_date=lte.${params.endStr}&trans_type=eq.expense`
  if (!params.isHQ && params.storeFilter !== 'All') {
    pettyFilter += `&${buildStoreFieldOrIlikeFragment('store', params.storeFilter)}`
  }
  const pettyRaw = (await supabaseSelectFilter('petty_cash_transactions', pettyFilter, {
    select: 'id,trans_date,amount,store,memo,trans_type,account_subject_id,vendor_code',
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
    vendor_code?: string | null
  }[] | null

  const acc: IncomeStatementPurchaseDrillPettyRow[] = []
  const vk = String(params.vendorKey || PL_PETTY_CASH_PURCHASE_VENDOR_KEY).trim()
  for (const r of pettyRaw || []) {
    if ((r.trans_type || '').toLowerCase() !== 'expense') continue
    const st = String(r.store || '').trim()
    if (params.isHQ) {
      if (!isHqAccountingStoreRow(st)) continue
    }
    if (!isPlCogsPurchaseAccountSubject(r.account_subject_id, params.subjectMeta)) continue
    const vendorCode = String(r.vendor_code || '').trim()
    if (vk === PL_PETTY_CASH_PURCHASE_VENDOR_KEY) {
      if (vendorCode) continue
    } else if (params.vendorPurchaseKeyIndex) {
      if (!drillVendorMatchesBankRow(vk, vendorCode || null, params.vendorPurchaseKeyIndex)) continue
    }
    const pid = Number(r.id)
    if (!pid) continue
    const sid =
      r.account_subject_id != null && !isNaN(Number(r.account_subject_id))
        ? Number(r.account_subject_id)
        : null
    const meta = sid != null ? params.subjectMeta.get(sid) : undefined
    acc.push({
      kind: 'petty',
      id: pid,
      transDate: String(r.trans_date || '').slice(0, 10),
      amount: Math.abs(Number(r.amount) || 0),
      store: r.store != null ? String(r.store) : null,
      memo: r.memo != null ? String(r.memo) : null,
      accountSubjectId: sid,
      accountSubjectCode: meta?.code ?? null,
      accountSubjectName: meta?.name ?? null,
    })
  }
  const truncated = (pettyRaw?.length || 0) >= BASE_LIMIT || acc.length > PURCHASE_DRILL_LIMIT
  const rows = truncated ? acc.slice(0, PURCHASE_DRILL_LIMIT) : acc
  return { rows, truncated }
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
    pettyCash: [],
    truncated: { inbound: false, bank: false, orders: false, petty: false },
  }
  if (!vendorKey) return empty

  if (vendorKey === PL_PETTY_CASH_PURCHASE_VENDOR_KEY) {
    const subjectMeta = await loadAccountSubjectMeta()
    const { rows, truncated } = await listPettyCashPurchaseDrillRows({
      startStr,
      endStr,
      storeFilter,
      isHQ,
      subjectMeta,
      vendorKey,
    })
    return {
      ...empty,
      pettyCash: rows,
      truncated: { ...empty.truncated, petty: truncated },
    }
  }

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

  const [itemAccountSubjectMapDrill, subjectMetaForInbound, vendorPurchaseKeyIndexDrill] = await Promise.all([
    loadItemAccountSubjectMap(),
    loadAccountSubjectMeta(),
    loadVendorPurchaseKeyIndex(),
  ])
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  const locationPatterns = await resolvePurchaseLocationPatterns(
    isHQ ? '입고등록' : storeFilter !== 'All' ? storeFilter : null,
    !isHQ && storeFilter === 'All'
  )
  let inboundFilter = `log_type=eq.Inbound&log_date=gte.${dayStartUtcIso}&log_date=lt.${nextDayStartUtcIso}`
  if (locationPatterns.length === 1) {
    inboundFilter += `&location=ilike.${encodeURIComponent(locationPatterns[0])}`
  } else if (locationPatterns.length > 1) {
    inboundFilter += `&or=(${locationPatterns.map((p) => `location.ilike.${encodeURIComponent(p)}`).join(',')})`
  }
  const inboundRaw = (await supabaseSelectFilterAllPages('stock_logs', inboundFilter, {
    select: 'id,log_date,location,item_code,qty,unit_cost,invoice_unit_price,vendor_target,reference_no',
    order: 'id.desc',
    pageSize: 8000,
    maxRows: ACCOUNTING_ROWS_MAX,
  })) as {
    id?: number
    log_date?: string
    location?: string
    item_code?: string
    qty?: number
    unit_cost?: number | null
    invoice_unit_price?: number | null
    vendor_target?: string
    reference_no?: string | null
  }[]

  const excludeFromHqInboundDrill = !isHQ
  const hqVendorIndexDrill = excludeFromHqInboundDrill
    ? await loadHqVendorMatchIndex()
    : { codes: new Set<string>(), names: new Set<string>() }
  const inboundAcc: IncomeStatementPurchaseDrillInboundRow[] = []
  for (const r of inboundRaw || []) {
    const vendorTarget = String(r.vendor_target || '').trim()
    const referenceNo = String(r.reference_no || '').trim()
    if (shouldSkipStoreInboundForHqPurchase(vendorTarget, referenceNo, excludeFromHqInboundDrill, hqVendorIndexDrill)) continue
    if (
      !isHQ &&
      storeFilter === 'All' &&
      (r.location === '입고등록' || isHqAccountingStoreRow(String(r.location || '')))
    ) {
      continue
    }
    if (!drillVendorMatchesInboundRow(vendorKey, vendorTarget, vendorPurchaseKeyIndexDrill)) continue
    const code = String(r.item_code || '').trim()
    if (!code) continue
    const routed = isExpenseRoutedItem(code, itemAccountSubjectMapDrill, subjectMetaForInbound)
    if (routed.isExpense) continue
    const qty = Number(r.qty) || 0
    const unitCost =
      r.invoice_unit_price != null && !isNaN(Number(r.invoice_unit_price))
        ? Number(r.invoice_unit_price)
        : r.unit_cost != null && !isNaN(Number(r.unit_cost))
          ? Number(r.unit_cost)
          : 0
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
  const inboundFetchTruncated = (inboundRaw?.length || 0) >= ACCOUNTING_ROWS_MAX
  const inboundTruncated = inboundFetchTruncated || inboundAcc.length > PURCHASE_DRILL_LIMIT
  const inbound = inboundTruncated ? inboundAcc.slice(0, PURCHASE_DRILL_LIMIT) : inboundAcc

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
    accountIds = []
  }

  const bankAcc: IncomeStatementPurchaseDrillBankRow[] = []
  /** 집계와 동일: 해당 거래처 직접입고가 있으면 통장 매입지급은 드릴에서 숨김 */
  const includeBankPaymentsInDrill = inboundAcc.length === 0
  if (includeBankPaymentsInDrill && accountIds.length > 0) {
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
    }[] = []
    try {
      btRows = (await supabaseSelectFilterAllPages(
        'bank_transactions',
        `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw&category=eq.purchase_payment`,
        {
          select: 'id,trans_date,amount,vendor_code,memo,note,store,ref_type,ref_id',
          order: 'trans_date.desc',
          pageSize: 8000,
          maxRows: ACCOUNTING_ROWS_MAX,
        }
      )) as typeof btRows
    } catch {
      btRows = []
    }
    const linkedByBankIdDrill = await loadInboundLinkedAmountByBankId(
      btRows.map((r) => Number(r.id)).filter((id) => id > 0)
    )
    for (const r of btRows) {
      if (storeFilter !== 'All') {
        const bts = String(r.store || '').trim()
        if (isHQ) {
          if (bts && !isHqAccountingStoreRow(bts)) continue
        } else {
          if (bts && !storeMatchesIncomeFilter(bts, storeFilter)) continue
        }
      }
      if (!drillVendorMatchesBankRow(vendorKey, r.vendor_code, vendorPurchaseKeyIndexDrill)) continue
      const id = Number(r.id)
      if (!id) continue
      const netAmt = netBankPurchasePaymentForIncomeStatement(
        Number(r.amount) || 0,
        linkedByBankIdDrill.get(id) || 0
      )
      if (netAmt <= 0) continue
      const rid = r.ref_id != null && !isNaN(Number(r.ref_id)) ? Number(r.ref_id) : null
      bankAcc.push({
        kind: 'bank',
        id,
        transDate: String(r.trans_date || '').slice(0, 10),
        amount: netAmt,
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

  const subjectMetaDrill = subjectMetaForInbound
  const { rows: pettyCash, truncated: pettyTruncated } = await listPettyCashPurchaseDrillRows({
    startStr,
    endStr,
    storeFilter,
    isHQ,
    subjectMeta: subjectMetaDrill,
    vendorKey,
    vendorPurchaseKeyIndex: vendorPurchaseKeyIndexDrill,
  })

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
    pettyCash,
    truncated: {
      inbound: inboundTruncated,
      bank: bankTruncated,
      orders: false,
      petty: pettyTruncated,
    },
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
  const rollupStores = resolveAccountingRollupStores(scope)
  if (rollupStores && rollupStores.length > 1) {
    const perStore = await Promise.all(
      rollupStores.map((store) =>
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
        | null)?.filter((x) => isHqAccountingStoreRow(String(x.store || ''))) || []
    } else if (storeFilter !== 'All') {
      const storeFrag = buildStoreFieldOrIlikeFragment('store', storeFilter)
      // 빈 필터면 전 계좌 조회가 되어 잔액이 부풀 수 있음 → 매장 미매칭 시 빈 목록
      bankAccounts = storeFrag
        ? ((await supabaseSelectFilter('bank_accounts', storeFrag, {
            select: 'id,store,opening_balance',
            limit: 2000,
          })) as { id?: number; store?: string; opening_balance?: number }[] | null) || []
        : []
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
        .filter((a) => isHqAccountingStoreRow(String(a.store || '')))
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

export type IncomeStatementExpenseDrillPayrollRow = {
  kind: 'payroll'
  id: number
  name: string
  store: string
  amount: number
  netPay: number
  sso: number
  tax: number
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
  payroll: IncomeStatementExpenseDrillPayrollRow[]
  truncated: { petty: boolean; bank: boolean; fixed: boolean; payroll: boolean }
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
    payroll: [],
    truncated: { petty: false, bank: false, fixed: false, payroll: false },
  }
  if (wantSubjectId != null && isNaN(wantSubjectId)) return empty

  const subjectMeta = await loadAccountSubjectMeta()
  const payrollAgg = await loadPayrollAggregateForIncomeStatement({
    yearMonth,
    storeFilter,
    isHQ,
    subjectMeta,
  })
  const payrollMatchesSubject =
    payrollAgg.total > 0 &&
    (wantSubjectId == null
      ? payrollAgg.preferredSubjectId == null
      : payrollAgg.preferredSubjectId === wantSubjectId ||
        payrollAgg.salarySubjectIds.has(wantSubjectId))

  const payrollPayWindowEndStr = plFetchEndStrWithPayrollPayWindow(endStr)
  const salaryDrillDecision = (row: {
    account_subject_id?: number | null
    memo?: string | null
    trans_date?: string | null
    expense_date?: string | null
  }) =>
    resolveSalaryCashPlDecision({
      isSalaryLike: isSalaryLikePlExpenseRow({
        accountSubjectId: row.account_subject_id,
        memo: row.memo,
        subjectMeta,
        salarySubjectIds: payrollAgg.salarySubjectIds,
      }),
      payrollExpenseThisMonth: payrollAgg.total,
      transDate: row.trans_date,
      expenseDate: row.expense_date,
      plYearMonth: yearMonth,
    })

  let pettyFilter = `trans_date=gte.${startStr}&trans_date=lte.${payrollPayWindowEndStr}&trans_type=eq.expense`
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
      if (!isHqAccountingStoreRow(st)) continue
    }
    if (!expenseDrillMatchesSubject(r.account_subject_id, wantSubjectId)) continue
    if (!isPlExpenseAccountSubject(r.account_subject_id, subjectMeta)) continue
    const salaryDecision = salaryDrillDecision(r)
    if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
    if (salaryDecision === 'not-salary') {
      const td = String(r.trans_date || '').slice(0, 10)
      if (td < startStr || td > endStr) continue
    }
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
  const feeAccrualPl = await loadDeliveryCardFeeAccrualsForPl({
    startStr,
    endStr,
    storeFilter,
    isHQ,
    subjectMeta,
  })
  const feeAccountSubjectIds = new Set(feeAccountSubjectIdsFromMeta(subjectMeta).allIds)
  if (accountIds.length > 0) {
    const { rows: btRows, truncated } = await fetchBankWithdrawRowsForPl(
      accountIds,
      startStr,
      payrollPayWindowEndStr,
      {
        feeAccountSubjectIds,
      }
    )
    bankFetchTruncated = truncated
    for (const r of btRows) {
      if (!bankWithdrawCountsTowardPlExpense(r.category)) continue
      const salaryDecision = salaryDrillDecision(r)
      if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
      if (salaryDecision === 'not-salary') {
        if (!bankExpenseInPlPeriod(String(r.trans_date || ''), r.expense_date, startStr, endStr)) continue
      }
      if (!expenseDrillMatchesSubject(r.account_subject_id, wantSubjectId)) continue
      if (!isPlExpenseAccountSubject(r.account_subject_id, subjectMeta)) continue
      const bid = Number(r.id)
      if (!bid) continue
      // 손익 본표와 동일: 수수료 지급예정에 연결된 통장은 이중 표시 제외
      if (feeAccrualPl.linkedBankTransactionIds.has(bid)) continue
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
  // 5528/5529 지급예정 — 본표에 포함된 accrual을 드릴에도 표시
  for (const ar of feeAccrualPl.rows) {
    if (!expenseDrillMatchesSubject(ar.accountSubjectId, wantSubjectId)) continue
    const memoParts = ['[지급예정]', ar.memo || ''].filter(Boolean)
    bankAcc.push({
      kind: 'bank',
      id: ar.id,
      transDate: ar.expenseDate || startStr,
      expenseDate: ar.expenseDate || null,
      amount: ar.amount,
      category: 'expense_accrual',
      memo: memoParts.join(' ').trim() || '[지급예정]',
      store: ar.store,
    })
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
        if (!isHqAccountingStoreRow(st)) continue
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

  const payrollRows: IncomeStatementExpenseDrillPayrollRow[] = []
  if (payrollMatchesSubject) {
    for (const r of payrollAgg.records) {
      payrollRows.push({
        kind: 'payroll',
        id: r.id,
        name: r.name,
        store: r.store,
        amount: r.amount,
        netPay: r.netPay,
        sso: r.sso,
        tax: r.tax,
      })
    }
  }
  const payrollTruncated = payrollRows.length > EXPENSE_DRILL_LIMIT
  const payrollSlice = payrollTruncated ? payrollRows.slice(0, EXPENSE_DRILL_LIMIT) : payrollRows

  return {
    ...empty,
    petty: pettySlice,
    bankWithdrawals: bankSlice,
    fixedExpenses: fixedSlice,
    payroll: payrollSlice,
    truncated: {
      petty: pettyTruncated,
      bank: bankTruncated,
      fixed: fixedTruncated,
      payroll: payrollTruncated,
    },
  }
}

