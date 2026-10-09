import {
  resolveAccountingStoreFilterFromAuth,
  parseCommaSeparatedStoreFilter,
  resolveFranchiseeAccountingAllowedStoresOnly,
} from '@/lib/accounting-store-scope'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStore } from '@/lib/permissions'
import type {
  IncomeStatementAmountBasisKind,
  IncomeStatementDisplayAmounts,
  IncomeStatementEbitdaBridge,
} from '@/lib/income-statement-display'
import { getBangkokMonthRange } from '@/lib/bangkok-time'

export const BASE_LIMIT = 20000
export const ACCOUNTING_ROWS_MAX = 1_000_000
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

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function isDeliveryAppFeeWithdrawRow(row: { vendor_code?: string | null; memo?: string | null }): boolean {
  const vendorCode = String(row.vendor_code || '').trim().toUpperCase()
  if (vendorCode && DELIVERY_APP_FEE_VENDOR_CODES.has(vendorCode)) return true
  const memo = String(row.memo || '').toLowerCase()
  if (!memo) return false
  return memo.includes('delivery app fee') || memo.includes('배달앱 수수료')
}

export function isCardFeeWithdrawRow(row: { vendor_code?: string | null; memo?: string | null }): boolean {
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
    /** PP.30 납부(세금 귀속월). 화면 VAT 포함 보기에서만 비용 합계에 가산 */
    pp30VatRemittance: number
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
  /** 분개 2150 차입금 */
  glAccount2150: number
  /** borrowing_transactions 보조원장 합 */
  subledgerBorrowings: number
  /** 분개 1150 대여금 */
  glAccount1150: number
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
    /** 재무상태표 표시용 — 분개 1150 대여금 */
    loansReceivable: number
    total: number
  }
  liabilities: {
    /** 재무상태표 표시용 — 분개 2110 기준 */
    payables: number
    /** 재무상태표 표시용 — 분개 2150 차입금 */
    borrowings: number
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
