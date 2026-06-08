/** 매출 관리 기간 집계: total vs 결제수단 합계 불일치 감지 */

export const POS_SALES_PAYMENT_TENDER_GAP_EPS = 0.02

export type PosSalesPaymentTenderFields = {
  cashSales?: number
  creditSales?: number
  qrSales?: number
  otherSales?: number
  deliveryAppSales?: number
}

export type PosSalesPaymentTenderGapRow = PosSalesPaymentTenderFields & {
  label: string
  key: string
  total: number
  storeCode?: string
  storeLabel?: string
}

export type PosSalesPaymentTenderGapItem = {
  label: string
  key: string
  total: number
  tenderSum: number
  gap: number
  storeCode?: string
  storeLabel?: string
}

export function posSalesPeriodPaymentTenderSum(row: PosSalesPaymentTenderFields): number {
  return (
    (Number(row.cashSales) || 0) +
    (Number(row.creditSales) || 0) +
    (Number(row.qrSales) || 0) +
    (Number(row.otherSales) || 0) +
    (Number(row.deliveryAppSales) || 0)
  )
}

export function posSalesPeriodPaymentTenderGap(
  row: PosSalesPaymentTenderFields & { total?: number }
): number {
  const total = Math.max(0, Number(row.total) || 0)
  const tender = posSalesPeriodPaymentTenderSum(row)
  const gap = total - tender
  if (Math.abs(gap) <= POS_SALES_PAYMENT_TENDER_GAP_EPS) return 0
  return Math.round(gap * 100) / 100
}

export function collectPosSalesPaymentTenderGaps(
  rows: PosSalesPaymentTenderGapRow[],
  opts?: { minGap?: number }
): PosSalesPaymentTenderGapItem[] {
  const minGap = opts?.minGap ?? POS_SALES_PAYMENT_TENDER_GAP_EPS
  const out: PosSalesPaymentTenderGapItem[] = []
  for (const row of rows) {
    const total = Math.max(0, Number(row.total) || 0)
    const tenderSum = posSalesPeriodPaymentTenderSum(row)
    const gap = Math.round((total - tenderSum) * 100) / 100
    if (Math.abs(gap) <= minGap) continue
    out.push({
      label: row.label,
      key: row.key,
      total,
      tenderSum: Math.round(tenderSum * 100) / 100,
      gap,
      storeCode: row.storeCode,
      storeLabel: row.storeLabel,
    })
  }
  out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
  return out
}
