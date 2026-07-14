/**
 * 태국 7% VAT — 출고 Delivery Note / Tax Invoice 와 미수금(order-receivable-hq) 공통 규칙
 * (소계 round → VAT round(소계×7%) → 합계)
 */
const VAT_RATE = 0.07

/** 태국 바트 금액 — 소수 둘째 자리 (PO·인보이스·미수금 공통). IEEE -0 → 0 (화면 `-0.00` 방지) */
export function roundMoney2(value: number): number {
  const n = Math.round(Number(value || 0) * 100) / 100
  return Object.is(n, -0) ? 0 : n
}

function roundTo2(value: number): number {
  return roundMoney2(value)
}

export function thaiInvoiceTotalsFromRawSubtotal(rawLineSum: number): {
  subtotalRounded: number
  vatRounded: number
  grandTotal: number
} {
  const subtotalRounded = roundTo2(Math.abs(rawLineSum))
  const vatRounded = roundTo2(subtotalRounded * VAT_RATE)
  const grandTotal = roundTo2(subtotalRounded + vatRounded)
  return { subtotalRounded, vatRounded, grandTotal }
}
