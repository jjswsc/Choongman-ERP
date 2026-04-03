/**
 * 태국 7% VAT — 출고 Delivery Note / Tax Invoice 와 미수금(order-receivable-hq) 공통 규칙
 * (소계 round → VAT round(소계×7%) → 합계)
 */
const VAT_RATE = 0.07

export function thaiInvoiceTotalsFromRawSubtotal(rawLineSum: number): {
  subtotalRounded: number
  vatRounded: number
  grandTotal: number
} {
  const subtotalRounded = Math.round(Math.abs(rawLineSum))
  const vatRounded = Math.round(subtotalRounded * VAT_RATE)
  const grandTotal = subtotalRounded + vatRounded
  return { subtotalRounded, vatRounded, grandTotal }
}
