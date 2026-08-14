/**
 * 채널 확인 — KBank QR(PromptPay) 당일 POS 합계.
 * K Merchant Report는 익일 반영이 일반적이므로, 당일 대조는 POS payment_qr 기준.
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
import { CHANNEL_BANK_GL_CODES } from '@/lib/pos-channel-bank-ledger'

export type KbankQrReconcileOrderRow = {
  created_at?: string | null
  store_code?: string | null
  status?: string | null
  payment_qr?: number | null
}

export type KbankQrReconcileDayRow = {
  date: string
  orderCount: number
  qrSales: number
  bankDepositAmt: number | null
}

export type KbankQrReconcileRow = {
  storeCode: string
  orderCount: number
  qrSales: number
  bankDepositAmt: number | null
  days: KbankQrReconcileDayRow[]
}

export type KbankQrReconcileKpi = {
  orderCount: number
  qrSales: number
  bankDepositAmt: number
  storeCount: number
}

export type KbankQrReconcileResult = {
  rows: KbankQrReconcileRow[]
  kpi: KbankQrReconcileKpi
}

const EPS = 0.005

function isCompletedStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
  return (POS_SALES_COMPLETED_STATUSES as readonly string[]).includes(s)
}

export function aggregateKbankQrReconcileRows(
  orders: KbankQrReconcileOrderRow[],
  options?: { businessDateForRow?: (row: KbankQrReconcileOrderRow) => string }
): KbankQrReconcileRow[] {
  type Acc = {
    orderCount: number
    qrSales: number
    days: Map<string, { orderCount: number; qrSales: number }>
  }
  const byStore = new Map<string, Acc>()

  for (const row of orders) {
    if (!isCompletedStatus(row.status)) continue
    const qr = Math.max(0, Number(row.payment_qr) || 0)
    if (qr <= EPS) continue
    const store = canonicalSalesStoreRowKey(String(row.store_code ?? '').trim())
    if (!store) continue
    const dateRaw = options?.businessDateForRow?.(row) || String(row.created_at ?? '').slice(0, 10)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : String(dateRaw).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    let acc = byStore.get(store)
    if (!acc) {
      acc = { orderCount: 0, qrSales: 0, days: new Map() }
      byStore.set(store, acc)
    }
    acc.orderCount += 1
    acc.qrSales = roundSettlementMoney(acc.qrSales + qr)
    const day = acc.days.get(date) || { orderCount: 0, qrSales: 0 }
    day.orderCount += 1
    day.qrSales = roundSettlementMoney(day.qrSales + qr)
    acc.days.set(date, day)
  }

  const rows: KbankQrReconcileRow[] = [...byStore.entries()].map(([storeCode, acc]) => ({
    storeCode,
    orderCount: acc.orderCount,
    qrSales: roundSettlementMoney(acc.qrSales),
    bankDepositAmt: null,
    days: [...acc.days.entries()]
      .map(([date, d]) => ({
        date,
        orderCount: d.orderCount,
        qrSales: roundSettlementMoney(d.qrSales),
        bankDepositAmt: null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }))

  rows.sort((a, b) => a.storeCode.localeCompare(b.storeCode) || b.qrSales - a.qrSales)
  return rows
}

export function buildKbankQrReconcileResult(rows: KbankQrReconcileRow[]): KbankQrReconcileResult {
  let orderCount = 0
  let qrSales = 0
  let bankDepositAmt = 0
  for (const r of rows) {
    orderCount += r.orderCount
    qrSales = roundSettlementMoney(qrSales + r.qrSales)
    bankDepositAmt = Math.round((bankDepositAmt + (r.bankDepositAmt ?? 0)) * 100) / 100
  }
  return {
    rows,
    kpi: {
      orderCount,
      qrSales,
      bankDepositAmt,
      storeCount: rows.length,
    },
  }
}

export function aggregateQrBankDeposits(params: {
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
    if (String(row.accountSubjectCode || '').trim() !== CHANNEL_BANK_GL_CODES.qr) continue
    const storeRaw = String(row.accountStore || '').trim()
    if (!storeRaw) continue
    if (storeCodes.length > 0 && !rowMatchesAnySalesStoreSelection(storeRaw, storeCodes)) continue
    const date = attributedSalesDateForBankDeposit(row)
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

function qrRowToCashRow(row: KbankQrReconcileRow): CashReconcileRow {
  return {
    storeCode: row.storeCode,
    orderCount: row.orderCount,
    cashSales: row.qrSales,
    bankDepositAmt: row.bankDepositAmt,
    days: row.days.map((d) => ({
      date: d.date,
      orderCount: d.orderCount,
      cashSales: d.qrSales,
      bankDepositAmt: d.bankDepositAmt,
    })),
  }
}

function cashRowToQrRow(row: CashReconcileRow): KbankQrReconcileRow {
  return {
    storeCode: row.storeCode,
    orderCount: row.orderCount,
    qrSales: row.cashSales,
    bankDepositAmt: row.bankDepositAmt,
    days: row.days.map((d) => ({
      date: d.date,
      orderCount: d.orderCount,
      qrSales: d.cashSales,
      bankDepositAmt: d.bankDepositAmt,
    })),
  }
}

export function applyQrBankDepositsToRows(
  rows: KbankQrReconcileRow[],
  agg: CashBankDepositAgg
): KbankQrReconcileRow[] {
  return applyCashBankDepositsToRows(rows.map(qrRowToCashRow), agg).map(cashRowToQrRow)
}

export const EMPTY_KBANK_QR_RECONCILE: KbankQrReconcileResult = {
  rows: [],
  kpi: { orderCount: 0, qrSales: 0, bankDepositAmt: 0, storeCount: 0 },
}
