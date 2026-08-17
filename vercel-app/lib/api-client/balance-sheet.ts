/**
 * (재무상태표·보조원장) — income-statement.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
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
  glAccount2150?: number
  subledgerBorrowings?: number
  glAccount1150?: number
  glAccount1010: number
  glSource: 'rpc' | 'select'
}

export interface BalanceSheetData {
  yearMonth: string
  startStr?: string
  endStr: string
  storeFilter: string
  timezone: string
  assets: {
    cashAndBanks: number
    inventory: number
    receivables: number
    loansReceivable?: number
    total: number
  }
  liabilities: { payables: number; borrowings?: number; total: number }
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
  borrowings?: {
    glAccount2150: number
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
  receivableBankSubledgerGaps: {
    bankId: number
    transDate: string
    amount: number
    storeName: string
    memo: string | null
    isPosStore: boolean
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

