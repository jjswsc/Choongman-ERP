/**
 * 채널 확인 — 당일 POS payment_card vs 매장 통장 계정과목 4120~4124.
 * 카드 정산은 익일 입금이 흔하므로, 통장은 인식일(없으면 입금일 전날)로 일자 대조.
 */
import { POS_SALES_COMPLETED_STATUSES } from '@/lib/pos-sales-period-aggregate'
import { canonicalSalesStoreRowKey, rowMatchesAnySalesStoreSelection } from '@/lib/pos-sales-store-filter'
import { roundSettlementMoney } from '@/lib/pos-channel-settlement'
import {
  applyCashBankDepositsToRows,
  type CashReconcileRow,
} from '@/lib/pos-cash-reconcile'
import {
  cashBankDepositStoreDateKey,
  type CashBankDepositAgg,
} from '@/lib/pos-cash-bank-deposit'
import { attributedSalesDateForBankDeposit } from '@/lib/pos-delivery-app-bank-deposit'
import { CARD_BANK_GL_CODES } from '@/lib/pos-channel-bank-ledger'

export type CardReconcileOrderRow = {
  created_at?: string | null
  store_code?: string | null
  status?: string | null
  payment_card?: number | null
}

export type CardReconcileDayRow = {
  date: string
  orderCount: number
  cardSales: number
  bankDepositAmt: number | null
}

export type CardReconcileRow = {
  storeCode: string
  orderCount: number
  cardSales: number
  bankDepositAmt: number | null
  days: CardReconcileDayRow[]
}

export type CardReconcileKpi = {
  orderCount: number
  cardSales: number
  bankDepositAmt: number
  storeCount: number
}

export type CardReconcileResult = {
  rows: CardReconcileRow[]
  kpi: CardReconcileKpi
}

const EPS = 0.005
const CARD_GL = new Set<string>(CARD_BANK_GL_CODES)

function isCompletedStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
  return (POS_SALES_COMPLETED_STATUSES as readonly string[]).includes(s)
}

export function aggregateCardReconcileRows(
  orders: CardReconcileOrderRow[],
  options?: { businessDateForRow?: (row: CardReconcileOrderRow) => string }
): CardReconcileRow[] {
  type Acc = {
    orderCount: number
    cardSales: number
    days: Map<string, { orderCount: number; cardSales: number }>
  }
  const byStore = new Map<string, Acc>()

  for (const row of orders) {
    if (!isCompletedStatus(row.status)) continue
    const card = Math.max(0, Number(row.payment_card) || 0)
    if (card <= EPS) continue
    const store = canonicalSalesStoreRowKey(String(row.store_code ?? '').trim())
    if (!store) continue
    const dateRaw = options?.businessDateForRow?.(row) || String(row.created_at ?? '').slice(0, 10)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : String(dateRaw).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    let acc = byStore.get(store)
    if (!acc) {
      acc = { orderCount: 0, cardSales: 0, days: new Map() }
      byStore.set(store, acc)
    }
    acc.orderCount += 1
    acc.cardSales = roundSettlementMoney(acc.cardSales + card)
    const day = acc.days.get(date) || { orderCount: 0, cardSales: 0 }
    day.orderCount += 1
    day.cardSales = roundSettlementMoney(day.cardSales + card)
    acc.days.set(date, day)
  }

  const rows: CardReconcileRow[] = [...byStore.entries()].map(([storeCode, acc]) => ({
    storeCode,
    orderCount: acc.orderCount,
    cardSales: roundSettlementMoney(acc.cardSales),
    bankDepositAmt: null,
    days: [...acc.days.entries()]
      .map(([date, d]) => ({
        date,
        orderCount: d.orderCount,
        cardSales: roundSettlementMoney(d.cardSales),
        bankDepositAmt: null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }))

  rows.sort((a, b) => a.storeCode.localeCompare(b.storeCode) || b.cardSales - a.cardSales)
  return rows
}

export function buildCardReconcileResult(rows: CardReconcileRow[]): CardReconcileResult {
  let orderCount = 0
  let cardSales = 0
  let bankDepositAmt = 0
  for (const r of rows) {
    orderCount += r.orderCount
    cardSales = roundSettlementMoney(cardSales + r.cardSales)
    bankDepositAmt = Math.round((bankDepositAmt + (r.bankDepositAmt ?? 0)) * 100) / 100
  }
  return {
    rows,
    kpi: {
      orderCount,
      cardSales,
      bankDepositAmt,
      storeCount: rows.length,
    },
  }
}

export function aggregateCardBankDeposits(params: {
  rows: Array<{
    accountStore?: string | null
    transDate?: string | null
    salesDate?: string | null
    transType?: string | null
    amount?: number | null
    accountSubjectCode?: string | null
  }>
  startStr: string
  endStr: string
  storeCodes?: string[]
}): CashBankDepositAgg {
  const start = String(params.startStr || '').slice(0, 10)
  const end = String(params.endStr || '').slice(0, 10)
  const byStore = new Map<string, number>()
  const byStoreDate = new Map<string, number>()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { byStore, byStoreDate }
  }
  const storeCodes = (params.storeCodes || []).map((s) => String(s || '').trim()).filter(Boolean)
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

  for (const row of params.rows) {
    if (String(row.transType || '').trim().toLowerCase() !== 'deposit') continue
    if (!CARD_GL.has(String(row.accountSubjectCode || '').trim())) continue
    const storeRaw = String(row.accountStore || '').trim()
    if (!storeRaw) continue
    if (storeCodes.length > 0 && !rowMatchesAnySalesStoreSelection(storeRaw, storeCodes)) continue
    const date = attributedSalesDateForBankDeposit(row)
    if (!date || date < start || date > end) continue
    const amt = Math.abs(Number(row.amount) || 0)
    if (amt <= EPS) continue
    const store = canonicalSalesStoreRowKey(storeRaw)
    byStore.set(store, round2((byStore.get(store) || 0) + amt))
    const dayKey = cashBankDepositStoreDateKey(store, date)
    byStoreDate.set(dayKey, round2((byStoreDate.get(dayKey) || 0) + amt))
  }
  return { byStore, byStoreDate }
}

function cardRowToCashRow(row: CardReconcileRow): CashReconcileRow {
  return {
    storeCode: row.storeCode,
    orderCount: row.orderCount,
    cashSales: row.cardSales,
    bankDepositAmt: row.bankDepositAmt,
    days: row.days.map((d) => ({
      date: d.date,
      orderCount: d.orderCount,
      cashSales: d.cardSales,
      bankDepositAmt: d.bankDepositAmt,
    })),
  }
}

function cashRowToCardRow(row: CashReconcileRow): CardReconcileRow {
  return {
    storeCode: row.storeCode,
    orderCount: row.orderCount,
    cardSales: row.cashSales,
    bankDepositAmt: row.bankDepositAmt,
    days: row.days.map((d) => ({
      date: d.date,
      orderCount: d.orderCount,
      cardSales: d.cashSales,
      bankDepositAmt: d.bankDepositAmt,
    })),
  }
}

export function applyCardBankDepositsToRows(
  rows: CardReconcileRow[],
  agg: CashBankDepositAgg
): CardReconcileRow[] {
  return applyCashBankDepositsToRows(rows.map(cardRowToCashRow), agg).map(cashRowToCardRow)
}

export const EMPTY_CARD_RECONCILE: CardReconcileResult = {
  rows: [],
  kpi: { orderCount: 0, cardSales: 0, bankDepositAmt: 0, storeCount: 0 },
}
