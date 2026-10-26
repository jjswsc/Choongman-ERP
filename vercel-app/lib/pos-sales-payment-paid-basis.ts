/**
 * 매출관리「결제/카드」주문 집계 — 결산·시재 현금과 동일하게
 * paid_at(없으면 created_at) 영업일로 필터.
 */
import type { PosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import {
  filterCashReconcileRowsByBusinessDateRange,
  type CashReconcileOrderRow,
} from '@/lib/pos-cash-reconcile'
import { makeCashReconcileBusinessDateForRow } from '@/lib/pos-cash-reconcile-business-date'
import type { PosPaymentSalesBucketRow } from '@/lib/pos-payment-tender-labels'

export function filterPosSalesRowsToPaidBusinessDay<
  T extends {
    created_at?: string | null
    paid_at?: string | null
    store_code?: string | null
    payment_cash?: number | null
  },
>(
  rows: T[],
  bizCtx: PosBusinessDaySettingsContext,
  startYmd: string,
  endYmd: string
): T[] {
  const businessDateForRow = makeCashReconcileBusinessDateForRow(bizCtx)
  return filterCashReconcileRowsByBusinessDateRange(
    rows as CashReconcileOrderRow[],
    startYmd,
    endYmd,
    businessDateForRow
  ) as T[]
}

export function sumPosSalesPaymentCash(rows: { payment_cash?: number | null }[]): number {
  let sum = 0
  for (const r of rows) {
    const c = Number(r.payment_cash) || 0
    if (c > 0.005) sum += c
  }
  return Math.round(sum * 100) / 100
}

/** RPC·오픈일 집계 summary의 cash 행을 결제 영업일 합으로 덮어씀 */
export function patchPosPaymentSummaryCash(
  summary: PosPaymentSalesBucketRow[],
  liveCash: number
): PosPaymentSalesBucketRow[] {
  const cash = Math.max(0, Math.round((Number(liveCash) || 0) * 100) / 100)
  let found = false
  const next = summary.map((r) => {
    if (String(r.paymentKey).toLowerCase() !== 'cash') return r
    found = true
    return { ...r, sales: cash }
  })
  if (!found && cash > 0.005) {
    next.push({ paymentKey: 'cash', sales: cash })
  }
  return next.filter((r) => String(r.paymentKey).toLowerCase() !== 'cash' || r.sales > 0.005)
}
