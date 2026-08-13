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
  store_code?: string | null
  status?: string | null
  payment_cash?: number | null
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
    if (!isCompletedStatus(row.status)) continue
    const cash = Math.max(0, Number(row.payment_cash) || 0)
    if (cash <= EPS) continue
    const store = canonicalSalesStoreRowKey(String(row.store_code ?? '').trim())
    if (!store) continue
    const dateRaw = options?.businessDateForRow?.(row) || String(row.created_at ?? '').slice(0, 10)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : String(dateRaw).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

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
