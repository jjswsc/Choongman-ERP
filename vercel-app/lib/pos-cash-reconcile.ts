/**
 * 채널 확인 — 당일 POS payment_cash vs 통장 현금입금.
 */
import { POS_SALES_COMPLETED_STATUSES } from '@/lib/pos-sales-period-aggregate'
import { canonicalSalesStoreRowKey, rowMatchesSalesStoreSelection } from '@/lib/pos-sales-store-filter'
import { roundSettlementMoney } from '@/lib/pos-channel-settlement'
import {
  cashBankDepositStoreDateKey,
  type CashBankDepositAgg,
} from '@/lib/pos-cash-bank-deposit'

export type CashReconcileOrderRow = {
  created_at?: string | null
  /** 결제 완료 시각 — 현금 집계·드릴은 paid_at 우선(없으면 created_at) */
  paid_at?: string | null
  store_code?: string | null
  status?: string | null
  payment_cash?: number | null
}

/**
 * 현금 채널·시재·결산 집계 시각: 오픈(판매)일 우선 — 회계·현장(Fang) 요청.
 * created_at 없으면 paid_at 폴백.
 * (영수증에는 별도로 결제일 표시 가능)
 */
export function cashReconcileEventTimestamp(row: {
  paid_at?: string | null
  created_at?: string | null
}): string {
  const created = String(row.created_at ?? '').trim()
  if (created) return created
  return String(row.paid_at ?? '').trim()
}

/** ISO/DB 시각 → Date (파싱 실패 시 null) */
export function parseCashReconcileEventDate(raw: string): Date | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const d = new Date(s.includes('T') || /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 조회 기간 안(오픈 영업일)인 현금 행만.
 */
export function filterCashReconcileRowsByBusinessDateRange(
  rows: CashReconcileOrderRow[],
  startYmd: string,
  endYmd: string,
  businessDateForRow?: (row: CashReconcileOrderRow) => string
): CashReconcileOrderRow[] {
  const lo = startYmd.slice(0, 10)
  const hi = endYmd.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lo) || !/^\d{4}-\d{2}-\d{2}$/.test(hi)) return []
  const a = lo <= hi ? lo : hi
  const b = lo <= hi ? hi : lo
  return rows.filter((row) => {
    const d = resolveCashReconcileBusinessDate(row, businessDateForRow)
    return d >= a && d <= b
  })
}

/** 현금 드릴다운용 — 집계와 동일 필터 + 주문 식별 필드 */
export type CashReconcileDrillOrderInput = CashReconcileOrderRow & {
  id?: number | string | null
  order_no?: string | null
  order_type?: string | null
  total?: number | null
  paid_at?: string | null
}

export type CashReconcileDrillOrder = {
  orderId: number
  orderNo: string
  storeCode: string
  businessDate: string
  paidAt: string
  createdAt: string
  paymentCash: number
  totalAmount: number
  orderType: string
}

export type CashReconcileDayRow = {
  date: string
  orderCount: number
  cashSales: number
  bankDepositAmt: number | null
}

export type CashReconcileRow = {
  storeCode: string
  orderCount: number
  cashSales: number
  bankDepositAmt: number | null
  days: CashReconcileDayRow[]
}

export type CashReconcileKpi = {
  orderCount: number
  cashSales: number
  bankDepositAmt: number
  storeCount: number
}

export type CashReconcileResult = {
  rows: CashReconcileRow[]
  kpi: CashReconcileKpi
}

const EPS = 0.005

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function isCompletedStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
  return (POS_SALES_COMPLETED_STATUSES as readonly string[]).includes(s)
}

/** 채널 현금 집계·드릴다운 공통: 완료 + payment_cash > EPS */
export function resolveCashReconcileCountable(
  row: CashReconcileOrderRow
): { store: string; cash: number } | null {
  if (!isCompletedStatus(row.status)) return null
  const cash = Math.max(0, Number(row.payment_cash) || 0)
  if (cash <= EPS) return null
  const store = canonicalSalesStoreRowKey(String(row.store_code ?? '').trim())
  if (!store) return null
  return { store, cash }
}

export function resolveCashReconcileBusinessDate(
  row: CashReconcileOrderRow,
  businessDateForRow?: (row: CashReconcileOrderRow) => string
): string {
  const dateRaw =
    businessDateForRow?.(row) || cashReconcileEventTimestamp(row).slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : String(dateRaw).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
}

/** 전날 오픈·당일 결제(달력일 기준) — 시재 overnight 안내용 */
export function isCashReconcileOvernightCalendar(
  row: { paid_at?: string | null; created_at?: string | null },
  bangkokYmdOf = (iso: string) => {
    const d = new Date(
      iso.includes('T') || /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso.replace(' ', 'T')
    )
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  }
): boolean {
  const created = String(row.created_at ?? '').trim()
  const paid = String(row.paid_at ?? '').trim()
  if (!created || !paid) return false
  const c = bangkokYmdOf(created)
  const p = bangkokYmdOf(paid)
  return /^\d{4}-\d{2}-\d{2}$/.test(c) && /^\d{4}-\d{2}-\d{2}$/.test(p) && c < p
}

/**
 * 오픈일 기준 조회일(D)에 포함된 overnight — 전날/당일 오픈·다음날 결제.
 * 현금은 D에 잡히고, 안내용으로 건수·금액만 표시.
 */
export function summarizeCashOvernightPaidOnDate(
  orders: CashReconcileDrillOrderInput[],
  options: {
    businessDateForRow?: (row: CashReconcileOrderRow) => string
    /** 오픈 영업일 (= 조회일). 키 이름은 호환용 */
    paidBusinessDate: string
  }
): { orderCount: number; cashSales: number } {
  let orderCount = 0
  let cashSales = 0
  const want = options.paidBusinessDate
  for (const row of orders) {
    const counted = resolveCashReconcileCountable(row)
    if (!counted) continue
    if (!isCashReconcileOvernightCalendar(row)) continue
    const date = resolveCashReconcileBusinessDate(row, options.businessDateForRow)
    if (date !== want) continue
    orderCount += 1
    cashSales = roundSettlementMoney(cashSales + counted.cash)
  }
  return { orderCount, cashSales }
}

/**
 * 현금 주문 목록 (집계와 동일 필터).
 * orderCount·cashSales는 한도 전 전체 합; orders는 limit까지.
 */
export function listCashReconcileOrders(
  orders: CashReconcileDrillOrderInput[],
  options?: {
    businessDateForRow?: (row: CashReconcileOrderRow) => string
    storeCode?: string
    date?: string
    limit?: number
  }
): {
  orders: CashReconcileDrillOrder[]
  truncated: boolean
  orderCount: number
  cashSales: number
} {
  const limitRaw = options?.limit
  const limit =
    limitRaw != null && Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(500, Math.trunc(limitRaw)))
      : 200
  const storeFilter = String(options?.storeCode ?? '').trim()
  const dateFilter = String(options?.date ?? '').trim()
  const wantStore = storeFilter ? canonicalSalesStoreRowKey(storeFilter) : ''

  const matched: CashReconcileDrillOrder[] = []
  let orderCount = 0
  let cashSales = 0

  for (const row of orders) {
    const counted = resolveCashReconcileCountable(row)
    if (!counted) continue
    const date = resolveCashReconcileBusinessDate(row, options?.businessDateForRow)
    if (!date) continue
    if (
      storeFilter &&
      counted.store !== wantStore &&
      !rowMatchesSalesStoreSelection(counted.store, storeFilter)
    ) {
      continue
    }
    if (dateFilter && date !== dateFilter) continue

    orderCount += 1
    cashSales = roundSettlementMoney(cashSales + counted.cash)

    const idNum = Number(row.id)
    const orderId = Number.isFinite(idNum) && idNum > 0 ? Math.trunc(idNum) : 0
    const orderNo =
      String(row.order_no ?? '').trim() || (orderId > 0 ? `#${orderId}` : '')
    matched.push({
      orderId,
      orderNo: orderNo || '—',
      storeCode: counted.store,
      businessDate: date,
      paidAt: String(row.paid_at ?? '').trim(),
      createdAt: String(row.created_at ?? '').trim(),
      paymentCash: roundSettlementMoney(counted.cash),
      totalAmount: roundSettlementMoney(Math.max(0, Number(row.total) || 0)),
      orderType: String(row.order_type ?? '').trim(),
    })
  }

  matched.sort((a, b) =>
    String(b.paidAt || b.createdAt).localeCompare(String(a.paidAt || a.createdAt))
  )
  const sliced = matched.slice(0, limit)
  return {
    orders: sliced,
    truncated: matched.length > sliced.length,
    orderCount,
    cashSales,
  }
}

export function aggregateCashReconcileRows(
  orders: CashReconcileOrderRow[],
  options?: { businessDateForRow?: (row: CashReconcileOrderRow) => string }
): CashReconcileRow[] {
  type Acc = {
    orderCount: number
    cashSales: number
    days: Map<string, { orderCount: number; cashSales: number }>
  }
  const byStore = new Map<string, Acc>()

  for (const row of orders) {
    const counted = resolveCashReconcileCountable(row)
    if (!counted) continue
    const { store, cash } = counted
    const date = resolveCashReconcileBusinessDate(row, options?.businessDateForRow)
    if (!date) continue

    let acc = byStore.get(store)
    if (!acc) {
      acc = { orderCount: 0, cashSales: 0, days: new Map() }
      byStore.set(store, acc)
    }
    acc.orderCount += 1
    acc.cashSales = roundSettlementMoney(acc.cashSales + cash)
    const day = acc.days.get(date) || { orderCount: 0, cashSales: 0 }
    day.orderCount += 1
    day.cashSales = roundSettlementMoney(day.cashSales + cash)
    acc.days.set(date, day)
  }

  const rows: CashReconcileRow[] = [...byStore.entries()].map(([storeCode, acc]) => ({
    storeCode,
    orderCount: acc.orderCount,
    cashSales: roundSettlementMoney(acc.cashSales),
    bankDepositAmt: null,
    days: [...acc.days.entries()]
      .map(([date, d]) => ({
        date,
        orderCount: d.orderCount,
        cashSales: roundSettlementMoney(d.cashSales),
        bankDepositAmt: null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }))

  rows.sort((a, b) => a.storeCode.localeCompare(b.storeCode) || b.cashSales - a.cashSales)
  return rows
}

function takeBankForStore(
  remaining: Map<string, number>,
  storeCode: string
): number | null {
  const direct = remaining.get(storeCode)
  if (direct != null) {
    remaining.delete(storeCode)
    return direct
  }
  for (const [k, v] of remaining) {
    if (rowMatchesSalesStoreSelection(k, storeCode)) {
      remaining.delete(k)
      return v
    }
  }
  return null
}

function takeBankForStoreDate(
  remaining: Map<string, number>,
  storeCode: string,
  date: string
): number | null {
  const directKey = cashBankDepositStoreDateKey(storeCode, date)
  const direct = remaining.get(directKey)
  if (direct != null) {
    remaining.delete(directKey)
    return direct
  }
  for (const [k, v] of remaining) {
    const tab = k.lastIndexOf('\t')
    if (tab < 0) continue
    const s = k.slice(0, tab)
    const d = k.slice(tab + 1)
    if (d === date && rowMatchesSalesStoreSelection(s, storeCode)) {
      remaining.delete(k)
      return v
    }
  }
  return null
}

function mergeDaysWithBank(
  days: CashReconcileDayRow[],
  storeCode: string,
  remainingByDate: Map<string, number>
): CashReconcileDayRow[] {
  const byDate = new Map(days.map((d) => [d.date, { ...d }]))
  const dates = new Set(byDate.keys())
  for (const k of [...remainingByDate.keys()]) {
    const tab = k.lastIndexOf('\t')
    if (tab < 0) continue
    const s = k.slice(0, tab)
    const d = k.slice(tab + 1)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    if (s === storeCode || rowMatchesSalesStoreSelection(s, storeCode)) dates.add(d)
  }
  const merged: CashReconcileDayRow[] = [...dates]
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const pos = byDate.get(date) || { date, orderCount: 0, cashSales: 0, bankDepositAmt: null }
      const bank = takeBankForStoreDate(remainingByDate, storeCode, date)
      return {
        ...pos,
        bankDepositAmt: bank == null ? pos.bankDepositAmt : round2(bank),
      }
    })
  return merged
}

export function applyCashBankDepositsToRows(
  rows: CashReconcileRow[],
  agg: CashBankDepositAgg
): CashReconcileRow[] {
  const remainingStore = new Map(agg.byStore)
  const remainingDate = new Map(agg.byStoreDate)
  const withBank = rows.map((row) => {
    const found = takeBankForStore(remainingStore, row.storeCode)
    return {
      ...row,
      bankDepositAmt: found == null ? null : round2(found),
      days: mergeDaysWithBank(row.days, row.storeCode, remainingDate),
    }
  })
  return appendBankOnlyCashRows(withBank, remainingStore, remainingDate)
}

/** POS 현금은 없는데 통장에만 현금입금이 있는 매장 행을 추가한다. */
export function appendBankOnlyCashRows(
  rows: CashReconcileRow[],
  remainingByStore: Map<string, number>,
  remainingByDate: Map<string, number>
): CashReconcileRow[] {
  const have = new Set(rows.map((r) => r.storeCode))
  const extra: CashReconcileRow[] = []
  for (const [storeCode, amt] of remainingByStore) {
    if (have.has(storeCode)) continue
    const amount = round2(amt)
    if (amount <= EPS) continue
    extra.push({
      storeCode,
      orderCount: 0,
      cashSales: 0,
      bankDepositAmt: amount,
      days: mergeDaysWithBank([], storeCode, remainingByDate),
    })
    have.add(storeCode)
  }
  if (extra.length === 0) return rows
  return [...rows, ...extra].sort(
    (a, b) => a.storeCode.localeCompare(b.storeCode) || b.cashSales - a.cashSales
  )
}

export function buildCashReconcileResult(rows: CashReconcileRow[]): CashReconcileResult {
  let orderCount = 0
  let cashSales = 0
  let bankDepositAmt = 0
  for (const r of rows) {
    orderCount += r.orderCount
    cashSales = roundSettlementMoney(cashSales + r.cashSales)
    bankDepositAmt = round2(bankDepositAmt + (r.bankDepositAmt ?? 0))
  }
  return {
    rows,
    kpi: {
      orderCount,
      cashSales,
      bankDepositAmt,
      storeCount: rows.length,
    },
  }
}

export const EMPTY_CASH_RECONCILE: CashReconcileResult = {
  rows: [],
  kpi: { orderCount: 0, cashSales: 0, bankDepositAmt: 0, storeCount: 0 },
}
