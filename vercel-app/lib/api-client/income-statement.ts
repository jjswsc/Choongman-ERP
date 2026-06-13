/**
 * 손익계산서 API (api-client.ts에서 분리 — move only)
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray, jsonAsPlainObject } from '../safe-api-json'
import type { PosSalesCombinedDiscountResult } from './sales-management'

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export interface IncomeStatementData {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  timezone?: string
  sales: number
  purchases: number
  beginningInventory?: number
  endingInventory?: number
  cogs?: number
  expenses: number
  expenseBreakdown?: {
    pettyCash: number
    bankWithdraw: number
    deliveryAppFees: number
    cardFees: number
    fixedExpenses: number
    total: number
  }
  diagnostics?: {
    warnings: string[]
    limits: Record<string, { fetched: number; limit: number; total?: number }>
    /** 직접 입고 + 통장 매입지급에 동시에 잡힌 거래처 키(코드) */
    purchaseInboundBankOverlapVendorKeys?: string[]
    purchaseHqOutboundBasis?: {
      outboundTotal: number
      approvedOrdersTotal: number
      diff: number
    }
    hqOutboundDuplicateLinesDeduped?: number
    purchaseExcludedHqBankPayments?: { key: string; amount: number; label?: string }[]
  }
  expenseByAccountSubject?: {
    accountSubjectId: number | null
    code: string
    name: string
    nameEn: string | null
    nameTh: string | null
    amount: number
  }[]
  purchaseByVendor?: {
    key: string
    amount: number
    label?: string
    amountBasis?: 'stock_net' | 'pos_gross' | 'cash_gross'
  }[]
  /** 본사 손익: 출고 발주 store_name(매출처)별 매출 */
  salesByCustomer?: {
    key: string
    amount: number
    label?: string
    amountBasis?: 'stock_net' | 'pos_gross' | 'cash_gross'
  }[]
  /** 매장 손익: POS 영업일별 매출 */
  salesByDay?: {
    key: string
    amount: number
    label?: string
    amountBasis?: 'stock_net' | 'pos_gross' | 'cash_gross'
  }[]
  /** 손익 화면 VAT 토글용 (원천 집계 불변) */
  displayAmounts?: {
    salesGross: number
    salesNet: number
    purchasesGross: number
    purchasesNet: number
    beginningInventoryGross: number
    beginningInventoryNet: number
    endingInventoryGross: number
    endingInventoryNet: number
    salesStockVatBuckets?: { taxableNet: number; exemptNet: number }
    purchasesStockVatBuckets?: { taxableNet: number; exemptNet: number }
  }
  /** 손익 EBITDA 토글 — 순이익 가산 */
  ebitdaBridge?: {
    depreciation: number
    interest: number
    incomeTax: number
  }
  grossProfit: number
  netProfit: number
  error?: string
}

/** API 응답이 손익계산서 본문인지 검사 (오류 JSON·빈 객체 방지) */
export function isIncomeStatementData(v: unknown): v is IncomeStatementData {
  if (!v || typeof v !== 'object') return false
  const o = v as IncomeStatementData
  if (typeof o.error === 'string' && o.error.trim()) return false
  return (
    typeof o.yearMonth === 'string' &&
    typeof o.startStr === 'string' &&
    typeof o.endStr === 'string' &&
    typeof o.storeFilter === 'string' &&
    isFiniteNumber(o.sales) &&
    isFiniteNumber(o.purchases) &&
    isFiniteNumber(o.expenses) &&
    isFiniteNumber(o.grossProfit) &&
    isFiniteNumber(o.netProfit)
  )
}

export async function getIncomeStatement(params: {
  yearMonth?: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  includeDebug?: boolean
}) {
  const q = new URLSearchParams()
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.includeDebug) q.set('includeDebug', '1')
  const res = await apiFetchWithOffline(`/api/getIncomeStatement?${q}`)
  const payload = (await res.json()) as IncomeStatementData & { error?: string }
  if (!res.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`)
  }
  if (!isIncomeStatementData(payload)) {
    const errBody = payload as { error?: string }
    throw new Error(errBody.error || 'Invalid income statement response')
  }
  return payload
}

export type ManagementMarginBridgeData = {
  yearMonthStart: string
  yearMonthEnd: string
  startStr: string
  endStr: string
  storeFilter: string
  timezone: 'Asia/Bangkok'
  posAvailable: boolean
  posTruncated: boolean
  pos: {
    grossSalesBeforeDiscount: number
    netSales: number
    bundleDiscount: number
    paymentDiscount: number
    totalDiscount: number
    periodOrderCount: number
    combined: PosSalesCombinedDiscountResult
    byChannel: {
      channel: 'dine_in' | 'takeout' | 'delivery' | 'other'
      orderCount: number
      netSales: number
      bundleDiscount: number
      paymentDiscount: number
      totalDiscount: number
      foodCost: number
      packagingCost: number
      totalCost: number
      contributionMargin: number
      costPctOfNet: number
    }[]
  } | null
  theoreticalCost: {
    foodCost: number
    packagingCost: number
    totalCost: number
    matchedLineQty: number
    unmatchedLineQty: number
    bomUnmatchedLines: {
      menuId: string
      optionId: string
      menuLabel: string
      optionLabel: string
      reason: 'missing_menu_id' | 'missing_bom'
      lineQty: number
    }[]
    costPctOfGross: number
    costPctOfNet: number
    miseRatePercent: number
  } | null
  accounting: {
    sales: number
    purchases: number
    purchasesFood: number
    purchasesPackaging: number
    cogs: number
    grossProfit: number
    expenses: number
    netProfit: number
  } | null
  bridge: {
    contributionMargin: number | null
    contributionMarginPct: number | null
    theoreticalVsActualCogsDiff: number | null
    theoreticalVsActualCogsDiffPct: number | null
  }
  priorPeriod: {
    yearMonthStart: string
    yearMonthEnd: string
    startStr: string
    endStr: string
  } | null
  momCompare: {
    label: string
    current: number
    prior: number
    diff: number
    diffPct: number | null
  }[] | null
  dataQuality: {
    level: 'good' | 'caution' | 'review'
    reasons: string[]
  }
  storeRanking: {
    storeCode: string
    orderCount: number
    netSales: number
    bundleDiscount: number
    paymentDiscount: number
    totalDiscount: number
    bundleDiscountPctOfGross: number
    paymentDiscountPctOfGross: number
    discountPctOfGross: number
    totalCost: number
    costPctOfNet: number
    contributionMargin: number
    contributionPct: number
  }[] | null
  storeRankingHighlights: { highDiscount: string[]; highCost: string[] } | null
  warnings: string[]
  error?: string
}

export async function getManagementMarginBridge(params: {
  yearMonthStart: string
  yearMonthEnd: string
  storeFilter?: string
  userStore?: string
  userRole?: string
}): Promise<ManagementMarginBridgeData> {
  const q = new URLSearchParams()
  q.set('yearMonthStart', params.yearMonthStart)
  q.set('yearMonthEnd', params.yearMonthEnd)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getManagementMarginBridge?${q}`)
  const data = (await res.json()) as ManagementMarginBridgeData
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

/** 손익 매입 거래처 행 상세 (직접입고 / 통장 매입지급 / 본사승인 발주) */
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

export type IncomeStatementPurchaseDrillDown = {
  vendorKey: string
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  isHqOrders: boolean
  hqOutbounds: IncomeStatementPurchaseDrillHqOutboundRow[]
  hqOrders: IncomeStatementPurchaseDrillOrderRow[]
  inbound: IncomeStatementPurchaseDrillInboundRow[]
  bankPayments: IncomeStatementPurchaseDrillBankRow[]
  truncated: { inbound: boolean; bank: boolean; orders: boolean }
  error?: string
}

export async function getIncomeStatementPurchaseDrillDown(params: {
  yearMonth: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  vendorKey: string
}): Promise<IncomeStatementPurchaseDrillDown> {
  const q = new URLSearchParams()
  q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  q.set('vendorKey', params.vendorKey)
  const res = await apiFetchWithOffline(`/api/getIncomeStatementPurchaseDrillDown?${q}`)
  const data = (await res.json()) as IncomeStatementPurchaseDrillDown & { error?: string }
  if (!res.ok) {
    return { ...data, error: data.error || `HTTP ${res.status}` }
  }
  return data
}

export type IncomeStatementExpenseDrillDown = {
  accountSubjectKey: string
  accountSubjectId: number | null
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  petty: {
    kind: 'petty'
    id: number
    transDate: string
    amount: number
    store: string | null
    memo: string | null
    transType: string
  }[]
  bankWithdrawals: {
    kind: 'bank'
    id: number
    transDate: string
    expenseDate: string | null
    amount: number
    category: string | null
    memo: string | null
    store: string | null
  }[]
  fixedExpenses: {
    kind: 'fixed'
    id: number
    name: string
    store: string
    monthlyAmount: number
    startYearMonth: string | null
    endYearMonth: string | null
    memo: string | null
  }[]
  truncated: { petty: boolean; bank: boolean; fixed: boolean }
  error?: string
}

export async function getIncomeStatementExpenseDrillDown(params: {
  yearMonth: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  accountSubjectId: number | null
}): Promise<IncomeStatementExpenseDrillDown> {
  const q = new URLSearchParams()
  q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.accountSubjectId == null) {
    q.set('unclassified', '1')
  } else {
    q.set('accountSubjectKey', String(params.accountSubjectId))
  }
  const res = await apiFetchWithOffline(`/api/getIncomeStatementExpenseDrillDown?${q}`)
  const data = (await res.json()) as IncomeStatementExpenseDrillDown & { error?: string }
  if (!res.ok) {
    return {
      accountSubjectKey: params.accountSubjectId == null ? '__unclassified__' : String(params.accountSubjectId),
      accountSubjectId: params.accountSubjectId,
      yearMonth: params.yearMonth,
      startStr: '',
      endStr: '',
      storeFilter: params.storeFilter || 'All',
      petty: [],
      bankWithdrawals: [],
      fixedExpenses: [],
      truncated: { petty: false, bank: false, fixed: false },
      error: data.error || `HTTP ${res.status}`,
    }
  }
  return data
}

export type IncomeStatementOverrideRow = {
  year_month: string
  store_key: string
  sales_override_enabled: boolean
  sales_override_amount: number
  beginning_inv_override_enabled: boolean
  beginning_inv_override_amount: number
  updated_at?: string | null
  updated_by?: string | null
}

export async function fetchIncomeStatementOverrides(params: {
  yearMonth: string
  storeFilter: string
  userStore?: string
  userRole?: string
}): Promise<{ success: boolean; row?: IncomeStatementOverrideRow; error?: string }> {
  const q = new URLSearchParams()
  q.set("yearMonth", params.yearMonth)
  q.set("storeFilter", params.storeFilter)
  if (params.userStore) q.set("userStore", params.userStore)
  if (params.userRole) q.set("userRole", params.userRole)
  const res = await apiFetchWithOffline(`/api/incomeStatementOverrides?${q}`)
  const j = (await res.json()) as {
    success?: boolean
    row?: IncomeStatementOverrideRow
    error?: string
  }
  if (!res.ok) {
    return { success: false, error: j.error || `HTTP_${res.status}` }
  }
  return { success: Boolean(j.success), row: j.row, error: j.error }
}

export async function saveIncomeStatementOverrides(params: {
  yearMonth: string
  storeFilter: string
  userStore?: string
  userRole?: string
  updatedBy?: string
  salesOverrideEnabled: boolean
  salesOverrideAmount: number
  beginningInvOverrideEnabled: boolean
  beginningInvOverrideAmount: number
}): Promise<{ success: boolean; error?: string }> {
  const res = await apiFetchWithOffline("/api/incomeStatementOverrides", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      yearMonth: params.yearMonth,
      storeFilter: params.storeFilter,
      userStore: params.userStore,
      userRole: params.userRole,
      updatedBy: params.updatedBy,
      salesOverrideEnabled: params.salesOverrideEnabled,
      salesOverrideAmount: params.salesOverrideAmount,
      beginningInvOverrideEnabled: params.beginningInvOverrideEnabled,
      beginningInvOverrideAmount: params.beginningInvOverrideAmount,
    }),
  })
  const j = (await res.json()) as { success?: boolean; error?: string }
  if (!res.ok) {
    return { success: false, error: j.error || `HTTP_${res.status}` }
  }
  return { success: Boolean(j.success), error: j.error }
}

export interface UnpostedBankTransaction {
  id: number
  transDate: string
  amount: number
  category: string
  memo: string | null
  store: string | null
}

export interface BalanceSheetLedgerBreakdown {
  glAccount1130: number
  subledgerReceivables: number
  glAccount2110: number
  subledgerPayables: number
  glAccount1010: number
  glSource: 'rpc' | 'select'
}

export interface BalanceSheetData {
  yearMonth: string
  startStr?: string
  endStr: string
  storeFilter: string
  timezone: string
  assets: { cashAndBanks: number; inventory: number; receivables: number; total: number }
  liabilities: { payables: number; total: number }
  equity: { openingCapital: number; retainedEarningsYtd: number; currentPeriodProfit: number; total: number }
  balanceCheckDiff: number
  unpostedBankWithdrawals?: UnpostedBankTransaction[]
  ledgerBreakdown?: BalanceSheetLedgerBreakdown
}

export interface SubledgerGlReconciliationData {
  yearMonth: string
  endStr: string
  storeFilter: string
  timezone: string
  receivables: {
    glAccount1130: number
    subledgerTotal: number
    difference: number
    glSource: 'rpc' | 'select'
    subledgerSource: 'rpc' | 'select'
  }
  payables: {
    glAccount2110: number
    subledgerTotal: number
    difference: number
    glSource: 'rpc' | 'select'
    subledgerSource: 'rpc' | 'select'
  }
  cashGl1010: number
  riskyRevenueDeposits: {
    id: number
    transDate: string
    amount: number
    category: string
    store: string | null
    memo: string | null
  }[]
  pendingChannelSettlements: {
    id: number
    storeCode: string
    settleDate: string
    channel: string
    gross: number
    net: number
    fee: number
    bankTransactionId: number | null
    journalEntryId: number | null
  }[]
  receivableReceiveWithSettlementLink: {
    bankId: number
    transDate: string
    amount: number
    storeName: string | null
    settlementIds: number[]
  }[]
}

/** API 응답이 재무상태표 본문인지 검사 (오류 JSON·빈 객체 방지) */
export function isBalanceSheetData(v: unknown): v is BalanceSheetData {
  if (!v || typeof v !== 'object') return false
  const o = v as BalanceSheetData
  const a = o.assets
  const l = o.liabilities
  const e = o.equity
  return (
    typeof o.yearMonth === 'string' &&
    typeof o.endStr === 'string' &&
    !!a &&
    !!l &&
    !!e &&
    isFiniteNumber(a.cashAndBanks) &&
    isFiniteNumber(a.inventory) &&
    isFiniteNumber(a.receivables) &&
    isFiniteNumber(a.total) &&
    isFiniteNumber(l.payables) &&
    isFiniteNumber(l.total) &&
    isFiniteNumber(e.openingCapital) &&
    isFiniteNumber(e.retainedEarningsYtd) &&
    isFiniteNumber(e.currentPeriodProfit) &&
    isFiniteNumber(e.total) &&
    isFiniteNumber(o.balanceCheckDiff)
  )
}

export async function getBalanceSheet(params: {
  yearMonth?: string
  storeFilter?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams()
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getBalanceSheet?${q}`)
  const payload = (await res.json()) as BalanceSheetData & { error?: string }
  if (!res.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`)
  }
  if (!isBalanceSheetData(payload)) {
    const errBody = payload as { error?: string }
    throw new Error(errBody.error || 'Invalid balance sheet response')
  }
  return payload
}

export async function getSubledgerGlReconciliation(params: {
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams()
  q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getSubledgerGlReconciliation?${q}`)
  const payload = (await res.json()) as SubledgerGlReconciliationData & { error?: string }
  if (!res.ok) {
    throw new Error(payload.error || `HTTP ${res.status}`)
  }
  return payload
}

export type ThaiFilingResponsibility = 'in_house' | 'tax_agent' | 'tbd'

export async function getAccountingFilingPreferences(params: { userRole: string }) {
  const q = new URLSearchParams({ userRole: params.userRole })
  const res = await apiFetchWithOffline(`/api/getAccountingFilingPreferences?${q}`)
  return res.json() as Promise<{
    definitions: unknown[]
    responsibilities: Record<string, ThaiFilingResponsibility>
    notes: string | null
    updatedAt: string | null
  }>
}

export async function saveAccountingFilingPreferences(params: {
  userRole: string
  responsibilities: Record<string, ThaiFilingResponsibility>
  notes?: string | null
}) {
  const res = await apiFetchWithOffline('/api/saveAccountingFilingPreferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; responsibilities?: Record<string, ThaiFilingResponsibility>; error?: string }>
}

export async function getAccountingPeriods(params: { userRole: string; storeFilter?: string }) {
  const q = new URLSearchParams({ userRole: params.userRole })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getAccountingPeriods?${q}`)
  return res.json() as Promise<{
    storeScope?: string
    periods: {
      yearMonth: string
      storeScope?: string
      isClosed: boolean
      closedViaAll?: boolean
      closedAt: string | null
      closedBy: string | null
      unlockedAt?: string | null
      unlockedBy?: string | null
      unlockReason?: string | null
      unlockApprovedBy?: string | null
    }[]
  }>
}

export async function getAccountingPeriodCloseStatus(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, yearMonth: params.yearMonth })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getAccountingPeriodCloseStatus?${q}`)
  return res.json() as Promise<{
    snapshot?: {
      yearMonth: string
      storeScope: string
      isClosed: boolean
      closedViaAll: boolean
    }
    error?: string
  }>
}

export async function setAccountingPeriodClosed(params: {
  userRole: string
  yearMonth: string
  closed: boolean
  storeScope?: string
  storeFilter?: string
  closedBy?: string | null
  unlockReason?: string | null
  unlockApprovedBy?: string | null
}) {
  const res = await apiFetchWithOffline('/api/setAccountingPeriodClosed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export type TrialBalanceRow = {
  accountCode: string
  accountName: string | null
  debit: number
  credit: number
  netDebit: number
}

export async function getTrialBalance(params: {
  userRole: string
  yearMonth?: string
  storeFilter?: string
  userStore?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  const res = await apiFetchWithOffline(`/api/getTrialBalance?${q}`)
  return res.json() as Promise<{
    yearMonth: string
    rows: TrialBalanceRow[]
    totalDebit: number
    totalCredit: number
    diff: number
  }>
}

export async function getAccountingReconciliation(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
  userStore?: string
  profitLossAccountCode?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    storeFilter: params.storeFilter || 'All',
    profitLossAccountCode: params.profitLossAccountCode || '3120',
  })
  if (params.userStore) q.set('userStore', params.userStore)
  const res = await apiFetchWithOffline(`/api/getAccountingReconciliation?${q}`)
  return res.json() as Promise<{
    yearMonth: string
    storeFilter: string
    profitLossAccountCode: string
    summary: {
      tbRevenue: number
      tbExpense: number
      tbNetIncome: number
      tbDiff: number
      incomeNetProfit: number
      bsCurrentPeriodProfit: number
      closingPreviewNetIncome: number
      netDiff: number
      bsDiff: number
      closingDiff: number
    }
    mismatch: {
      trialUnbalanced: boolean
      tbVsIncome: boolean
      tbVsBalanceSheet: boolean
      tbVsClosingPreview: boolean
    }
  }>
}

export async function getVatLedger(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  q.set('storeFilter', params.storeFilter || 'All')
  const res = await apiFetchWithOffline(`/api/vatLedger?${q}`)
  const data = (await res.json()) as { entries?: Record<string, unknown>[]; error?: string }
  if (!res.ok) {
    return { entries: [], error: data?.error || `HTTP_${res.status}` }
  }
  return { entries: data.entries || [], error: data.error }
}

export type StoreTaxFilingProfileDto = {
  storeCode: string
  vendorCode?: string
  taxpayerName: string
  taxId: string
  branchNo: string
  placeOfBusiness: string
  ssoAccountNo?: string
  ssoBranchCode?: string
  ssoOfficeAddress?: string
  ssoPostcode?: string
  ssoPhone?: string
  ssoFax?: string
  ssoEmail?: string
  updatedAt?: string | null
  updatedBy?: string | null
}

export async function getStoreTaxFilingProfile(storeCode: string) {
  const q = new URLSearchParams({ storeCode })
  const res = await apiFetchWithOffline(`/api/storeTaxFilingProfiles?${q}`)
  const data = (await res.json()) as { profile?: StoreTaxFilingProfileDto; error?: string }
  if (!res.ok) {
    return { profile: null, error: data?.error || `HTTP_${res.status}` }
  }
  return { profile: data.profile || null }
}

export async function getStoreTaxFilingProfiles() {
  const res = await apiFetchWithOffline('/api/storeTaxFilingProfiles')
  const data = (await res.json()) as {
    profiles?: StoreTaxFilingProfileDto[]
    tableMissing?: boolean
    error?: string
  }
  if (!res.ok) {
    return { profiles: [] as StoreTaxFilingProfileDto[], error: data?.error || `HTTP_${res.status}` }
  }
  return { profiles: data.profiles || [], tableMissing: !!data.tableMissing }
}

export async function saveStoreTaxFilingProfile(params: {
  storeCode: string
  vendorCode?: string
  taxpayerName: string
  taxId: string
  branchNo: string
  placeOfBusiness?: string
  ssoAccountNo?: string
  ssoBranchCode?: string
  ssoOfficeAddress?: string
  ssoPostcode?: string
  ssoPhone?: string
  ssoFax?: string
  ssoEmail?: string
}) {
  const res = await apiFetchWithOffline('/api/storeTaxFilingProfiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success?: boolean
    profile?: StoreTaxFilingProfileDto
    error?: string
    hint?: string
  }>
}

export type VatLedgerStoreNameGapsReportDto = {
  taxMonths: string[]
  storeFilter: string
  inScopeRowCount: number
  emptyStoreNameRowCount: number
  emptyStoreNameOutputNet: number
  emptyStoreNameOutputVat: number
  emptyStoreNameInputNet: number
  emptyStoreNameInputVat: number
  otherStoreRowCount: number
  otherStoreOutputVat: number
  otherStoreInputVat: number
  samples: {
    id?: number
    doc_date: string
    direction: string
    net_amount: number
    vat_amount: number
    counterparty_name: string
    invoice_number: string
    memo: string
  }[]
}

export type IntercompanyVatReconcileReportDto = {
  months: string[]
  storeFilter: string
  issuedCount: number
  matchedCount: number
  missingInStoreCount: number
  extraInStoreCount: number
  diffCount: number
  hqIssuedNetTotal: number
  storeInputNetTotal: number
  storeInputVatTotal: number
  diffNetTotal: number
  rows: {
    storeName: string
    referenceNo: string
    hqIssuedNet: number
    storeInputNet: number
    storeInputVat: number
    diffNet: number
    status: 'missing_in_store_input' | 'extra_in_store_input' | 'net_diff'
  }[]
}

export async function getVatLedgerStoreNameGaps(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getVatLedgerStoreNameGaps?${q}`)
  const data = (await res.json()) as { report?: VatLedgerStoreNameGapsReportDto; error?: string }
  if (!res.ok) {
    return { report: null, error: data?.error || `HTTP_${res.status}` }
  }
  return { report: data.report || null }
}

export async function getIntercompanyVatReconcile(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/ops/intercompany-vat-reconcile?${q}`)
  const data = (await res.json()) as { report?: IntercompanyVatReconcileReportDto; error?: string }
  if (!res.ok) {
    return { report: null, error: data?.error || `HTTP_${res.status}` }
  }
  return { report: data.report || null }
}

/** 본사 출고(세금계산서) 이력이 있을 때만 매장↔본사 VAT 대사 UI를 노출 */
export async function probeIntercompanyVatReconcileApplicable(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    taxMonth: params.taxMonth,
    storeFilter: params.storeFilter,
    probeOnly: '1',
  })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  const res = await apiFetchWithOffline(`/api/ops/intercompany-vat-reconcile?${q}`)
  const data = (await res.json()) as { applicable?: boolean; error?: string }
  if (!res.ok) {
    return { applicable: false, error: data?.error || `HTTP_${res.status}` }
  }
  return { applicable: Boolean(data.applicable) }
}

export async function saveVatLedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/vatLedger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    id?: number
    error?: string
    pendingEvidenceCount?: number
    pendingEvidenceRows?: {
      id: number
      docDate: string
      counterpartyName: string
      invoiceNumber: string
      storeName: string
      memo: string
    }[]
  }>
}

export async function deleteVatLedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/vatLedger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export async function getPp36Ledger(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/pp36Ledger?${q}`)
  const data = (await res.json()) as { entries?: Record<string, unknown>[]; error?: string }
  if (!res.ok) {
    return { entries: [], error: data?.error || `HTTP_${res.status}` }
  }
  return { entries: data.entries || [], error: data.error }
}

export async function savePp36LedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/pp36Ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; error?: string }>
}

export async function deletePp36LedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/pp36Ledger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export async function getWithholdingTaxLedger(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/withholdingTaxLedger?${q}`)
  return res.json() as Promise<{ entries: Record<string, unknown>[] }>
}

export async function saveWithholdingTaxLedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/withholdingTaxLedger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; error?: string }>
}

export async function deleteWithholdingTaxLedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/withholdingTaxLedger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export async function getPnd54Ledger(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/pnd54Ledger?${q}`)
  const data = (await res.json()) as { entries?: Record<string, unknown>[]; error?: string }
  if (!res.ok) {
    return { entries: [], error: data?.error || `HTTP_${res.status}` }
  }
  return { entries: data.entries || [], error: data.error }
}

export async function savePnd54LedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/pnd54Ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; error?: string }>
}

export async function deletePnd54LedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/pnd54Ledger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export function getExportVatLedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  excludePosAuto?: boolean
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.excludePosAuto) q.set('excludePosAuto', '1')
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportVatLedgerCsv?${q}`
  }
  return `/api/exportVatLedgerCsv?${q}`
}

export function getExportWithholdingTaxLedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  format?: 'raw' | 'submission'
  formHint?: 'PND3' | 'PND53' | 'ALL'
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.format) q.set('format', params.format)
  if (params.formHint) q.set('formHint', params.formHint)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportWithholdingTaxLedgerCsv?${q}`
  }
  return `/api/exportWithholdingTaxLedgerCsv?${q}`
}

export function getExportPp36LedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportPp36LedgerCsv?${q}`
  }
  return `/api/exportPp36LedgerCsv?${q}`
}

export function getExportPnd54LedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportPnd54LedgerCsv?${q}`
  }
  return `/api/exportPnd54LedgerCsv?${q}`
}

export function getExportPnd1RdPrepTxtUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  filingForm?: 'pnd1' | 'pnd1a' | 'all'
  payerTaxId?: string
  payerBranchNo?: string
  payerName?: string
  includeHeader?: boolean
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.filingForm) q.set('filingForm', params.filingForm)
  if (params.payerTaxId) q.set('payerTaxId', params.payerTaxId)
  if (params.payerBranchNo) q.set('payerBranchNo', params.payerBranchNo)
  if (params.payerName) q.set('payerName', params.payerName)
  if (params.includeHeader) q.set('includeHeader', '1')
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportPnd1RdPrepTxt?${q}`
  }
  return `/api/exportPnd1RdPrepTxt?${q}`
}

export type ValidatePnd1RdPrepResult = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  filingForm: 'pnd1' | 'pnd1a' | 'all'
  totalRows: number
  validRows: number
  warningCounts: {
    missingPayeeName: number
    missingPayeeTaxId: number
    invalidPayeeTaxIdLength: number
    missingPaymentDate: number
    invalidPaymentDate: number
    missingIncomeType: number
    nonPositiveWithheldAmount: number
  }
  sampleWarnings: string[]
  issues: {
    lineNo: number
    rowId: number | null
    code:
      | 'missing_payee_name'
      | 'missing_payee_tax_id'
      | 'invalid_payee_tax_id_length'
      | 'missing_payment_date'
      | 'invalid_payment_date'
      | 'missing_income_type'
      | 'non_positive_withheld_amount'
    message: string
    payeeName: string
    certificateNo: string
  }[]
}

export type ValidatePnd3Pnd53Result = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  filingForm: 'PND3' | 'PND53' | 'ALL'
  totalRows: number
  validRows: number
  warningCounts: {
    missingPayeeName: number
    missingPayeeTaxId: number
    missingIncomeType: number
    missingCertificateNo: number
    invalidWhtRate: number
    nonPositiveWithheldAmount: number
  }
  sampleWarnings: string[]
  issues: {
    lineNo: number
    rowId: number | null
    code:
      | 'missing_payee_name'
      | 'missing_payee_tax_id'
      | 'missing_income_type'
      | 'missing_certificate_no'
      | 'invalid_wht_rate'
      | 'non_positive_wht_amount'
    message: string
    payeeName: string
    certificateNo: string
  }[]
}

export type PayrollWhtTinGapResult = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  storeFilter: string
  payrollRowCount: number
  gapRowCount: number
  uniqueEmployeeCount: number
  gaps: {
    id: number | null
    paymentDate: string
    taxMonth: string
    payeeName: string
    storeName: string
    whtAmount: number
    certificateNo: string
    formHint: string
    memo: string
  }[]
}

export async function validatePnd1RdPrep(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  filingForm?: 'pnd1' | 'pnd1a' | 'all'
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.filingForm) q.set('filingForm', params.filingForm)
  const res = await apiFetchWithOffline(`/api/validatePnd1RdPrep?${q}`)
  return res.json() as Promise<ValidatePnd1RdPrepResult>
}

export async function validatePnd3Pnd53(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  formHint?: 'PND3' | 'PND53' | 'ALL'
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.formHint) q.set('formHint', params.formHint)
  const res = await apiFetchWithOffline(`/api/validatePnd3Pnd53?${q}`)
  return res.json() as Promise<ValidatePnd3Pnd53Result>
}

export async function getPayrollWhtTinGaps(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getPayrollWhtTinGaps?${q}`)
  return res.json() as Promise<PayrollWhtTinGapResult>
}

export type Kt20kSettings = {
  companyTaxId: string
  companyName: string
  ssoOfficeProvince: string
  ssoOfficePhone: string
  businessCode5: string
  fundRatePercent: string
  updatedBy?: string
  updatedAt?: string
}

export async function getKt20kSettings(params: { userRole: string; year: number }) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    year: String(params.year),
  })
  const res = await apiFetchWithOffline(`/api/getKt20kSettings?${q}`)
  return res.json() as Promise<{ success: boolean; year: number; settings: Kt20kSettings }>
}

export async function saveKt20kSettings(params: {
  userRole: string
  year: number
  companyTaxId: string
  companyName: string
  ssoOfficeProvince: string
  ssoOfficePhone: string
  businessCode5: string
  fundRatePercent: string
  updatedBy?: string
}) {
  const res = await apiFetch('/api/saveKt20kSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export function getExportKt20kCsvUrl(params: { userRole: string; year: number; storeFilter?: string }) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    year: String(params.year),
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (typeof window !== 'undefined') return `${window.location.origin}/api/exportKt20kCsv?${q}`
  return `/api/exportKt20kCsv?${q}`
}

export type Pnd91EmployeeAnnual = {
  employeeKey: string
  employeeId: number | null
  name: string
  store: string
  taxId: string | null
  monthCount: number
  annualGross: number
  annualWhtPayroll: number
  annualWhtLedger: number
  annualSso: number
  annualNetPay: number
  whtLedgerMismatch: boolean
}

export type Pnd91AnnualSummaryResult = {
  success: boolean
  year: number
  storeFilter: string
  filingDueDate: string
  employees: Pnd91EmployeeAnnual[]
  totals: {
    employeeCount: number
    annualGross: number
    annualWhtPayroll: number
    annualWhtLedger: number
    annualSso: number
    annualNetPay: number
    whtMismatchCount: number
  }
  warnings: string[]
  error?: string
}

export async function getPnd91AnnualSummary(params: {
  year: number
  storeFilter?: string
}): Promise<Pnd91AnnualSummaryResult> {
  const q = new URLSearchParams({ year: String(params.year) })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getPnd91AnnualSummary?${q}`)
  return res.json() as Promise<Pnd91AnnualSummaryResult>
}

export function getExportPnd91AnnualCsvUrl(params: {
  year: number
  storeFilter?: string
  checklistJson?: string
}) {
  const q = new URLSearchParams({ year: String(params.year) })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.checklistJson) q.set('checklistJson', params.checklistJson)
  if (typeof window !== 'undefined') return `${window.location.origin}/api/exportPnd91AnnualCsv?${q}`
  return `/api/exportPnd91AnnualCsv?${q}`
}

export type ThaiTaxFilingSummary = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  vat: {
    outputNet: number
    outputVat: number
    inputNet: number
    inputVat: number
    payableVat: number
    missingTaxIdCount: number
    missingInvoiceCount: number
    rowCount: number
  }
  wht: {
    totalGross: number
    totalWithheld: number
    missingTaxIdCount: number
    missingCertificateCount: number
    rowCount: number
    byForm: Record<string, { gross: number; withheld: number; rows: number }>
  }
}

export type TaxReadinessChecklist = {
  period: {
    yearMonth: string
    startDate: string
    endDate: string
    storeFilter: string
  }
  limits: {
    sourceLimit: number
    hit: {
      bank: boolean
      petty: boolean
      card: boolean
      purchase: boolean
      sales: boolean
      journal: boolean
    }
  }
  domains: {
    bank: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    pettyCash: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    cardExpense: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    purchase: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    sales: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
      monthMismatchCount: number
      sampleMonthMismatchSourceIds: number[]
    }
  }
  score: {
    criticalIssues: number
    warningIssues: number
  }
  recommendations: string[]
}

export async function getThaiTaxFilingSummary(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    periodType: params.periodType || 'monthly',
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getThaiTaxFilingSummary?${q}`)
  return res.json() as Promise<ThaiTaxFilingSummary>
}

export async function getTaxReadinessChecklist(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getTaxReadinessChecklist?${q}`)
  return res.json() as Promise<TaxReadinessChecklist>
}

export type CorporateTaxComputationData = {
  periodType: 'monthly' | 'half_year' | 'annual'
  filingForm: 'pnd50' | 'pnd51'
  periodKey: string
  months: string[]
  storeFilter: string
  accountingProfit: number
  taxAddBack: number
  taxDeduction: number
  taxableIncome: number
  projectedAnnualTaxableIncome: number
  taxRate: number
  estimatedTax: number
  filingTaxDue: number
  pdfMeta: {
    formCode: 'P.N.D.50' | 'P.N.D.51'
    periodLabel: string
    periodStartMonth: string
    periodEndMonth: string
    generatedAtBangkok: string
    storeScopeLabel: string
  }
  validation: {
    isValid: boolean
    errors: string[]
    warnings: string[]
  }
  adjustments: { type: 'add_back' | 'deduction'; itemName: string; amount: number; memo: string | null }[]
}

export async function getCorporateTaxComputation(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
  userStore?: string
  taxRate?: number
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    periodType: params.periodType || 'monthly',
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.taxRate != null && !isNaN(Number(params.taxRate))) q.set('taxRate', String(params.taxRate))
  const res = await apiFetchWithOffline(`/api/getCorporateTaxComputation?${q}`)
  return res.json() as Promise<CorporateTaxComputationData>
}

export function getExportCorporateTaxPackageCsvUrl(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
  userStore?: string
  taxRate?: number
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    periodType: params.periodType || 'monthly',
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.taxRate != null && !isNaN(Number(params.taxRate))) q.set('taxRate', String(params.taxRate))
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportCorporateTaxPackageCsv?${q}`
  }
  return `/api/exportCorporateTaxPackageCsv?${q}`
}

export async function saveCorporateTaxAdjustments(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  adjustments: {
    adjustmentType: 'add_back' | 'deduction'
    itemCode?: string | null
    itemName: string
    amount: number
    memo?: string | null
  }[]
}) {
  const res = await apiFetchWithOffline('/api/saveCorporateTaxAdjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    periodKey?: string
    savedCount?: number
    rows?: Record<string, unknown>[]
    error?: string
  }>
}

export type AccountingWorkflowStatusRow = {
  id?: number
  year_month: string
  period_type?: 'monthly' | 'half_year' | 'annual'
  period_key?: string
  filing_type: string
  status: 'todo' | 'in_progress' | 'review' | 'done'
  note?: string | null
  owner?: string | null
  updated_by?: string | null
  updated_at?: string | null
  store_scope?: string | null
}

export type IncomeExpenseClosingPreview = {
  yearMonth: string
  storeFilter: string
  profitLossAccountCode: string
  profitLossAccountName: string
  revenueTotal: number
  expenseTotal: number
  netIncome: number
  lineCount: number
  lines: {
    accountCode: string
    accountName: string | null
    side: 'debit' | 'credit'
    amount: number
  }[]
}

export type IncomeExpenseClosingHistoryItem = {
  id?: number
  store_scope?: string | null
  status?: string | null
  created_at?: string | null
  created_by?: string | null
  memo?: string | null
  journal_entry_id?: number | null
  revenue_total?: number | null
  expense_total?: number | null
  net_income?: number | null
  line_count?: number | null
  payload?: unknown
}

export type AccountingComplianceAuditLog = {
  id?: number
  action_type?: string | null
  user_role?: string | null
  actor?: string | null
  decision?: 'allow' | 'deny' | 'error' | null
  reason_code?: string | null
  year_month?: string | null
  period_type?: 'monthly' | 'half_year' | 'annual' | null
  period_key?: string | null
  store_scope?: string | null
  filing_type?: string | null
  target_type?: string | null
  target_id?: string | null
  payload?: unknown
  created_at?: string | null
}

export async function getIncomeExpenseClosingPreview(params: {
  userRole: string
  userStore?: string
  yearMonth: string
  storeFilter?: string
  profitLossAccountCode?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    storeFilter: params.storeFilter || 'All',
    profitLossAccountCode: params.profitLossAccountCode || '3120',
  })
  if (params.userStore) q.set('userStore', params.userStore)
  const res = await apiFetchWithOffline(`/api/getIncomeExpenseClosingPreview?${q}`)
  return res.json() as Promise<{
    preview: IncomeExpenseClosingPreview
    closed?: { id?: number; entry_no?: string | null; posted_at?: string | null; posted_by?: string | null } | null
    draft?:
      | {
          id?: number
          status?: string | null
          memo?: string | null
          created_at?: string | null
          created_by?: string | null
          payload?: IncomeExpenseClosingPreview | null
        }
      | null
    history?: IncomeExpenseClosingHistoryItem[]
  }>
}

export function getExportIncomeExpenseClosingAuditCsvUrl(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    storeFilter: params.storeFilter || 'All',
  })
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportIncomeExpenseClosingAuditCsv?${q}`
  }
  return `/api/exportIncomeExpenseClosingAuditCsv?${q}`
}

export async function getAccountingComplianceAuditLogs(params: {
  userRole: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  decision?: 'allow' | 'deny' | 'error' | 'all'
  actionKeyword?: string
  storeFilter?: string
  limit?: number
}) {
  const q = new URLSearchParams({ userRole: params.userRole })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.decision && params.decision !== 'all') q.set('decision', params.decision)
  if (params.actionKeyword) q.set('actionKeyword', params.actionKeyword)
  if (params.limit != null && Number.isFinite(params.limit)) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline(`/api/getAccountingComplianceAuditLogs?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    success: o.success === true,
    rows: jsonAsArray<AccountingComplianceAuditLog>(o.rows),
    fallbackUsed: o.fallbackUsed === true,
    error: typeof o.error === 'string' ? o.error : undefined,
  }
}

export async function getAccountingComplianceAuditTrend(params: {
  userRole: string
  yearMonth: string
  months?: number
  periodType?: 'monthly' | 'half_year' | 'annual'
  decision?: 'allow' | 'deny' | 'error' | 'all'
  actionKeyword?: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    months: String(params.months ?? 3),
  })
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.decision && params.decision !== 'all') q.set('decision', params.decision)
  if (params.actionKeyword) q.set('actionKeyword', params.actionKeyword)
  const res = await apiFetchWithOffline(`/api/getAccountingComplianceAuditTrend?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    success: o.success === true,
    rows: jsonAsArray<{
      year_month?: string | null
      total?: number | null
      allow_count?: number | null
      deny_count?: number | null
      error_count?: number | null
      deny_rate?: number | null
      error_rate?: number | null
    }>(o.rows),
    fallbackUsed: o.fallbackUsed === true,
    error: typeof o.error === 'string' ? o.error : undefined,
  }
}

export async function getAccountingWorkflowReminders(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    storeFilter: params.storeFilter || 'All',
  })
  const res = await apiFetchWithOffline(`/api/getAccountingWorkflowReminders?${q}`)
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      success: false,
      rows: [] as {
        filingType: string
        filingLabelKo: string
        periodType: 'monthly' | 'half_year' | 'annual'
        yearMonth: string
        dueDateBangkok: string
        daysToDue: number
        severity: 'info' | 'warn' | 'critical'
        status: string
        messageKo: string
      }[],
    }
  }
  const o = raw as Record<string, unknown>
  return {
    success: o.success === true,
    bangkokToday: typeof o.bangkokToday === 'string' ? o.bangkokToday : undefined,
    rows: jsonAsArray<{
      filingType: string
      filingLabelKo: string
      periodType: 'monthly' | 'half_year' | 'annual'
      yearMonth: string
      dueDateBangkok: string
      daysToDue: number
      severity: 'info' | 'warn' | 'critical'
      status: string
      messageKo: string
    }>(o.rows),
    summary:
      o.summary && typeof o.summary === 'object' && !Array.isArray(o.summary)
        ? (o.summary as { critical: number; warn: number; info: number })
        : undefined,
    error: typeof o.error === 'string' ? o.error : undefined,
  }
}

export function getExportAccountingComplianceAuditCsvUrl(params: {
  userRole: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  decision?: 'allow' | 'deny' | 'error' | 'all'
  actionKeyword?: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.decision && params.decision !== 'all') q.set('decision', params.decision)
  if (params.actionKeyword) q.set('actionKeyword', params.actionKeyword)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportAccountingComplianceAuditCsv?${q}`
  }
  return `/api/exportAccountingComplianceAuditCsv?${q}`
}

export async function saveIncomeExpenseClosingDraft(params: {
  userRole: string
  userStore?: string
  createdBy?: string | null
  yearMonth: string
  storeFilter?: string
  profitLossAccountCode?: string
  memo?: string
}) {
  const res = await apiFetchWithOffline('/api/saveIncomeExpenseClosingDraft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    error?: string
    id?: number
    warning?: string
    preview?: IncomeExpenseClosingPreview
  }>
}

export async function postIncomeExpenseClosing(params: {
  userRole: string
  userStore?: string
  postedBy?: string | null
  yearMonth: string
  storeFilter?: string
  profitLossAccountCode?: string
  forceReset?: boolean
  autoLockPeriod?: boolean
  memo?: string
}) {
  const res = await apiFetchWithOffline('/api/postIncomeExpenseClosing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    error?: string
    journalEntryId?: number
    entryNo?: string
    preview?: IncomeExpenseClosingPreview
    autoLocked?: boolean
  }>
}

export async function getSsoSubmissionHistory(params?: { storeFilter?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params?.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline(`/api/getSsoSubmissionHistory?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    rows: jsonAsArray<AccountingWorkflowStatusRow>(o.rows),
    error: o.error != null ? String(o.error) : undefined,
  }
}

export async function getAccountingWorkflowStatus(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, yearMonth: params.yearMonth })
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getAccountingWorkflowStatus?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    rows: jsonAsArray<AccountingWorkflowStatusRow>(o.rows),
    fallbackUsed: o.fallbackUsed === true,
  }
}

export async function saveAccountingWorkflowStatus(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingType: string
  status: 'todo' | 'in_progress' | 'review' | 'done'
  note?: string | null
  owner?: string | null
  updatedBy?: string | null
  storeFilter?: string
}) {
  const res = await apiFetchWithOffline('/api/saveAccountingWorkflowStatus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; error?: string; fallbackUsed?: boolean }>
}

export type PayrollSsoExpenseSyncDto = {
  created: number
  updated: number
  skippedPaid: number
  deleted: number
  stores: { store: string; totalBaht: number; employeeCount: number }[]
}

export async function syncPayrollSsoExpenseAccruals(params: {
  yearMonth: string
  storeFilter?: string
  postedBy?: string
}) {
  const res = await apiFetch('/api/syncPayrollSsoExpenseAccruals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    sync?: PayrollSsoExpenseSyncDto
    error?: string
  }>
}
