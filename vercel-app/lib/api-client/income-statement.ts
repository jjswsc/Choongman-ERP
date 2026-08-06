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
    stockInboundExpense?: number
    payrollExpense?: number
    depreciationExpense?: number
    franchiseRoyalty?: number
    franchiseDeliveryGp?: number
    franchiseGrabGp?: number
    franchiseBillingCombined?: number
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
    vatAmount?: number
  }[]
  purchaseByVendor?: {
    key: string
    amount: number
    label?: string
    amountBasis?: 'stock_net' | 'pos_gross' | 'cash_gross'
    vatAmount?: number
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
    franchiseBillingGross?: number
    franchiseBillingNet?: number
    franchiseRoyaltyGross?: number
    franchiseRoyaltyNet?: number
    franchiseDeliveryGpGross?: number
    franchiseDeliveryGpNet?: number
    franchiseGrabGpGross?: number
    franchiseGrabGpNet?: number
    franchiseBillingCombinedGross?: number
    franchiseBillingCombinedNet?: number
    franchiseRevenueGross?: number
    franchiseRevenueNet?: number
    salesStockVatBuckets?: { taxableNet: number; exemptNet: number }
    purchasesStockVatBuckets?: { taxableNet: number; exemptNet: number }
    expensesCashVat?: number
    purchasesBankVat?: number
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
  pettyCash: IncomeStatementPurchaseDrillPettyRow[]
  truncated: { inbound: boolean; bank: boolean; orders: boolean; petty: boolean }
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
  payroll?: {
    kind: 'payroll'
    id: number
    name: string
    store: string
    amount: number
    netPay: number
    sso: number
    tax: number
  }[]
  truncated: { petty: boolean; bank: boolean; fixed: boolean; payroll?: boolean }
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

