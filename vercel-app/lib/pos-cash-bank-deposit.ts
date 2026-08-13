/**
 * 채널 확인 — 통장 현금입금(revenue_cash / 4140)을 매출일 기준으로 매장 합산.
 * 배달앱(입금일-1)과 달리 현금은 당일 입금이 흔하므로, 매출일이 없으면 입금일을 쓴다.
 */
import { isExpenseInternalBankNote } from '@/lib/bank-transaction-note-meta'
import { canonicalSalesStoreRowKey, rowMatchesAnySalesStoreSelection } from '@/lib/pos-sales-store-filter'

export const CASH_BANK_GL_CODE = '4140'

export type CashBankDepositInput = {
  transDate?: string | null
  salesDate?: string | null
  transType?: string | null
  amount?: number | null
  memo?: string | null
  note?: string | null
  category?: string | null
  storeName?: string | null
  accountSubjectCode?: string | null
}

const SKIP_DEPOSIT_CATEGORIES = new Set([
  'revenue_card',
  'revenue_qr',
  'revenue_delivery',
  'receivable_receive',
  'payable_pay',
  'expense',
  'advance',
  'transfer',
])

function addDaysToYmd(ymd: string, deltaDays: number): string {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7))
  const d = Number(ymd.slice(8, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** 통장 조회 창: 매출일 있는 행 + 익일 아침 입금(매출일 없음)을 담기 위한 trans_date 버퍼 */
export function cashBankDepositQueryTransDateWindow(
  startStr: string,
  endStr: string
): { from: string; to: string } {
  const start = String(startStr || '').slice(0, 10)
  const end = String(endStr || '').slice(0, 10)
  return { from: addDaysToYmd(start, -1), to: addDaysToYmd(end, 2) }
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function cashBankDepositStoreDateKey(storeCode: string, date: string): string {
  return `${storeCode}\t${date}`
}

/** 통장 매출일. 없으면 입금일(당일). */
export function attributedSalesDateForCashBankDeposit(row: {
  transDate?: string | null
  salesDate?: string | null
}): string {
  const sales = String(row.salesDate || '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(sales)) return sales
  const trans = String(row.transDate || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trans)) return ''
  return trans
}

function looksLikeCashMemo(row: CashBankDepositInput): boolean {
  const raw = `${row.memo || ''} ${row.note || ''} ${row.accountSubjectCode || ''}`
  return /현금입금|현금\b|\bcash\b/i.test(raw)
}

export function isCashBankDepositRow(row: CashBankDepositInput): boolean {
  if (String(row.transType || '').trim().toLowerCase() !== 'deposit') return false
  if (isExpenseInternalBankNote(row.note)) return false
  const cat = String(row.category || '').trim().toLowerCase()
  if (cat && SKIP_DEPOSIT_CATEGORIES.has(cat)) return false
  if (cat === 'revenue_cash') return true
  if (String(row.accountSubjectCode || '').trim() === CASH_BANK_GL_CODE) return true
  return looksLikeCashMemo(row)
}

export type CashBankDepositAgg = {
  byStore: Map<string, number>
  byStoreDate: Map<string, number>
}

export function aggregateCashBankDeposits(params: {
  rows: CashBankDepositInput[]
  startStr: string
  endStr: string
  storeCodes?: string[]
  /** 매장 1곳만 조회 중인데 통장 행에 매장이 비어 있으면 이 매장으로 귀속 */
  fallbackStoreCode?: string
}): CashBankDepositAgg {
  const start = String(params.startStr || '').slice(0, 10)
  const end = String(params.endStr || '').slice(0, 10)
  const byStore = new Map<string, number>()
  const byStoreDate = new Map<string, number>()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { byStore, byStoreDate }
  }

  const storeCodes = (params.storeCodes || []).map((s) => String(s || '').trim()).filter(Boolean)
  const fallbackStore = String(params.fallbackStoreCode || '').trim()

  for (const row of params.rows) {
    if (!isCashBankDepositRow(row)) continue
    let storeRaw = String(row.storeName || '').trim()
    if (!storeRaw && fallbackStore) storeRaw = fallbackStore
    if (!storeRaw) continue
    if (storeCodes.length > 0 && !rowMatchesAnySalesStoreSelection(storeRaw, storeCodes)) continue

    const date = attributedSalesDateForCashBankDeposit(row)
    if (!date || date < start || date > end) continue

    const amt = Math.abs(Number(row.amount) || 0)
    if (amt <= 0.005) continue

    const store = canonicalSalesStoreRowKey(storeRaw)
    byStore.set(store, round2((byStore.get(store) || 0) + amt))
    const dayKey = cashBankDepositStoreDateKey(store, date)
    byStoreDate.set(dayKey, round2((byStoreDate.get(dayKey) || 0) + amt))
  }
  return { byStore, byStoreDate }
}
