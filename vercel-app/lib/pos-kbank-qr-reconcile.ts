/**
 * 채널 확인 — KBank QR(PromptPay) 당일 POS 합계.
 * K Merchant Report는 익일 반영이 일반적이므로, 당일 대조는 POS payment_qr 기준.
 */
import { POS_SALES_COMPLETED_STATUSES } from '@/lib/pos-sales-period-aggregate'
import { canonicalSalesStoreRowKey } from '@/lib/pos-sales-store-filter'
import { roundSettlementMoney } from '@/lib/pos-channel-settlement'

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
}

export type KbankQrReconcileRow = {
  storeCode: string
  orderCount: number
  qrSales: number
  days: KbankQrReconcileDayRow[]
}

export type KbankQrReconcileKpi = {
  orderCount: number
  qrSales: number
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
    days: [...acc.days.entries()]
      .map(([date, d]) => ({
        date,
        orderCount: d.orderCount,
        qrSales: roundSettlementMoney(d.qrSales),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }))

  rows.sort((a, b) => a.storeCode.localeCompare(b.storeCode) || b.qrSales - a.qrSales)
  return rows
}

export function buildKbankQrReconcileResult(rows: KbankQrReconcileRow[]): KbankQrReconcileResult {
  let orderCount = 0
  let qrSales = 0
  for (const r of rows) {
    orderCount += r.orderCount
    qrSales = roundSettlementMoney(qrSales + r.qrSales)
  }
  return {
    rows,
    kpi: {
      orderCount,
      qrSales,
      storeCount: rows.length,
    },
  }
}

export const EMPTY_KBANK_QR_RECONCILE: KbankQrReconcileResult = {
  rows: [],
  kpi: { orderCount: 0, qrSales: 0, storeCount: 0 },
}
