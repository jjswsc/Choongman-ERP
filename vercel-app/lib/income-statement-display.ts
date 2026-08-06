/**
 * 손익계산서 화면 전용 — VAT 포함/제외 표시·EBITDA (원천 집계·다른 메뉴는 변경 없음).
 */
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'
import type { IncomeStatementData } from '@/lib/api-client'
import { stockNetLineGrossAmount, type NetVatBuckets } from '@/lib/income-statement-item-vat'

export type IncomeStatementVatDisplayMode = 'excluded' | 'included'

export type IncomeStatementAmountBasisKind = 'stock_net' | 'pos_gross' | 'cash_gross'

export type IncomeStatementDisplayAmounts = {
  salesGross: number
  salesNet: number
  purchasesGross: number
  purchasesNet: number
  beginningInventoryGross: number
  beginningInventoryNet: number
  endingInventoryGross: number
  endingInventoryNet: number
  /** 승인 회계 PO 가맹 청구 비용 — VAT 포함(total) / 제외(subtotal) */
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
  /** 발행측(본사/issuer) 매출 — VAT 토글용 */
  franchiseRevenueGross?: number
  franchiseRevenueNet?: number
  /** 품목 tax_type 반영 — 펼침 행 환산용 */
  salesStockVatBuckets?: NetVatBuckets
  purchasesStockVatBuckets?: NetVatBuckets
}

export type IncomeStatementEbitdaBridge = {
  depreciation: number
  interest: number
  incomeTax: number
}

export type IncomeStatementDisplayPrefs = {
  vatMode: IncomeStatementVatDisplayMode
  showEbitda: boolean
}

const PREFS_STORAGE_KEY = 'cm_erp_income_statement_display_prefs_v1'

/** 손익 VAT 토글용 — 승인 회계 PO 비용/매출 행 */
export function pickFranchiseBillingVatAmount(
  gross: number | undefined,
  net: number | undefined,
  mode: IncomeStatementVatDisplayMode
): number {
  return mode === 'included' ? Math.max(0, Number(gross) || 0) : Math.max(0, Number(net) || 0)
}

export function grossFromNetSubtotal(net: number): number {
  if (!net || net <= 0) return 0
  return thaiInvoiceTotalsFromRawSubtotal(net).grandTotal
}

export function netFromGrossSubtotal(gross: number, vatComponent = 0): number {
  const g = Math.max(0, Number(gross) || 0)
  const v = Math.max(0, Number(vatComponent) || 0)
  if (v > 0 && v < g) return Math.max(0, g - v)
  if (g <= 0) return 0
  const split = thaiInvoiceTotalsFromRawSubtotal(g / (1 + 0.07))
  return split.subtotalRounded
}

export function convertLineAmount(
  amount: number,
  kind: IncomeStatementAmountBasisKind,
  mode: IncomeStatementVatDisplayMode,
  stockVatBuckets?: NetVatBuckets | null
): number {
  const n = Math.max(0, Number(amount) || 0)
  if (n <= 0) return 0
  if (mode === 'included') {
    if (kind === 'stock_net') {
      if (stockVatBuckets && (stockVatBuckets.taxableNet > 0 || stockVatBuckets.exemptNet > 0)) {
        return stockNetLineGrossAmount(n, stockVatBuckets)
      }
      return grossFromNetSubtotal(n)
    }
    return n
  }
  if (kind === 'pos_gross') return netFromGrossSubtotal(n)
  if (kind === 'cash_gross') return n
  return n
}

export function pickDisplayAmount(
  basis: IncomeStatementDisplayAmounts | undefined,
  field: keyof IncomeStatementDisplayAmounts,
  fallback: number,
  mode: IncomeStatementVatDisplayMode
): number {
  if (!basis) return fallback
  const gross = Number(basis[`${field.replace(/Net$/, 'Gross')}` as keyof IncomeStatementDisplayAmounts]) || 0
  const net = Number(basis[field]) || 0
  if (field.endsWith('Gross')) {
    return mode === 'included' ? gross || fallback : net || fallback
  }
  const grossKey = field.replace(/Net$/, 'Gross') as keyof IncomeStatementDisplayAmounts
  const g = Number(basis[grossKey]) || 0
  const n = Number(basis[field]) || 0
  return mode === 'included' ? g || fallback : n || fallback
}

export function resolveIncomeStatementSalesAmount(
  data: IncomeStatementData,
  mode: IncomeStatementVatDisplayMode,
  manualSales?: number | null
): number {
  if (manualSales != null && Number.isFinite(manualSales)) {
    return manualSales
  }
  const b = data.displayAmounts
  if (!b) return Number(data.sales) || 0
  return mode === 'included' ? b.salesGross : b.salesNet
}

export function resolveIncomeStatementPurchasesAmount(
  data: IncomeStatementData,
  mode: IncomeStatementVatDisplayMode
): number {
  const b = data.displayAmounts
  if (!b) return Number(data.purchases) || 0
  return mode === 'included' ? b.purchasesGross : b.purchasesNet
}

export function resolveIncomeStatementInventoryAmount(
  data: IncomeStatementData,
  which: 'beginning' | 'ending',
  mode: IncomeStatementVatDisplayMode,
  manualBeginning?: number | null
): number {
  if (which === 'beginning' && manualBeginning != null && Number.isFinite(manualBeginning)) {
    return manualBeginning
  }
  const b = data.displayAmounts
  const fallback =
    which === 'beginning' ? Number(data.beginningInventory) || 0 : Number(data.endingInventory) || 0
  if (!b) return fallback
  if (which === 'beginning') {
    return mode === 'included' ? b.beginningInventoryGross : b.beginningInventoryNet
  }
  return mode === 'included' ? b.endingInventoryGross : b.endingInventoryNet
}

export function buildIncomeStatementViewNumbers(input: {
  data: IncomeStatementData
  vatMode: IncomeStatementVatDisplayMode
  manualSales?: number | null
  manualBeginningInventory?: number | null
}): {
  sales: number
  purchases: number
  beginningInventory: number
  endingInventory: number
  cogs: number
  grossProfit: number
  netProfit: number
  expenses: number
  ebitda: number | null
} {
  const b = input.data.displayAmounts
  const fbG = Math.max(0, Number(b?.franchiseBillingGross) || 0)
  const fbN = Math.max(0, Number(b?.franchiseBillingNet) || 0)
  // report.expenses 는 franchise gross 포함 가정 — VAT 제외 시 franchise분만 net으로 교체
  const expensesBase = Math.max(0, (Number(input.data.expenses) || 0) - fbG)
  const expenses =
    expensesBase + (input.vatMode === 'included' ? fbG : fbN)
  const sales = resolveIncomeStatementSalesAmount(input.data, input.vatMode, input.manualSales)
  const purchases = resolveIncomeStatementPurchasesAmount(input.data, input.vatMode)
  const beginningInventory = resolveIncomeStatementInventoryAmount(
    input.data,
    'beginning',
    input.vatMode,
    input.manualBeginningInventory
  )
  const endingInventory = resolveIncomeStatementInventoryAmount(input.data, 'ending', input.vatMode)
  const cogs = beginningInventory + purchases - endingInventory
  const grossProfit = sales - cogs
  const netProfit = grossProfit - expenses
  const bridge = input.data.ebitdaBridge
  const ebitda =
    bridge != null
      ? netProfit +
        (Number(bridge.depreciation) || 0) +
        (Number(bridge.interest) || 0) +
        (Number(bridge.incomeTax) || 0)
      : null
  return {
    sales,
    purchases,
    beginningInventory,
    endingInventory,
    cogs,
    grossProfit,
    netProfit,
    expenses,
    ebitda,
  }
}

/** 비용 계정 코드 → EBITDA 가산(이자·법인세 등) */
export function sumEbitdaAddBacksFromExpenseSubjects(
  rows: NonNullable<IncomeStatementData['expenseByAccountSubject']> | undefined
): Pick<IncomeStatementEbitdaBridge, 'interest' | 'incomeTax'> {
  let interest = 0
  let incomeTax = 0
  for (const row of rows || []) {
    const code = String(row.code || '').trim()
    const amt = Math.abs(Number(row.amount) || 0)
    if (!amt) continue
    if (/^561/.test(code)) interest += amt
    else if (/^58[78]/.test(code)) incomeTax += amt
  }
  return { interest, incomeTax }
}

export function readIncomeStatementDisplayPrefs(): IncomeStatementDisplayPrefs {
  if (typeof window === 'undefined') {
    return { vatMode: 'included', showEbitda: false }
  }
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY)
    if (!raw) return { vatMode: 'included', showEbitda: false }
    const o = JSON.parse(raw) as Partial<IncomeStatementDisplayPrefs>
    const vatMode = o.vatMode === 'excluded' ? 'excluded' : 'included'
    return { vatMode, showEbitda: o.showEbitda === true }
  } catch {
    return { vatMode: 'included', showEbitda: false }
  }
}

export function writeIncomeStatementDisplayPrefs(prefs: IncomeStatementDisplayPrefs): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore quota
  }
}
