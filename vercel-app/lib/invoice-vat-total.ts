/**
 * 태국 7% VAT — 출고 Delivery Note / Tax Invoice 와 미수금(order-receivable-hq) 공통 규칙
 * (소계 round → VAT round(소계×7%) → 합계)
 *
 * FlowAccount식 VAT 포함 문서: 포함 합계에서 VAT = round(합계×7/107), 공급가 = 합계−VAT
 */
const VAT_RATE = 0.07
const VAT_INCLUSIVE_DIVISOR = 1 + VAT_RATE // 1.07

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

/**
 * FlowAccount식: VAT 포함 합계(จำนวนเงินรวมทั้งสิ้น)에서 공급가·VAT 역산.
 * VAT = round(포함합계 × 7/107), 공급가 = 포함합계 − VAT
 */
export function thaiInvoiceTotalsFromVatInclusiveGrand(grandInclusive: number): {
  subtotalRounded: number
  vatRounded: number
  grandTotal: number
} {
  const grandTotal = roundTo2(Math.abs(grandInclusive))
  const vatRounded = roundTo2((grandTotal * VAT_RATE) / VAT_INCLUSIVE_DIVISOR)
  const subtotalRounded = roundTo2(grandTotal - vatRounded)
  return { subtotalRounded, vatRounded, grandTotal }
}

/**
 * VAT 포함 줄 합계 → 공급가 줄 합계 (FlowAccount: 줄 금액÷1.07 반올림).
 */
export function vatExclusiveLineFromInclusiveLine(lineInclusive: number): number {
  return roundTo2(Math.abs(Number(lineInclusive) || 0) / VAT_INCLUSIVE_DIVISOR)
}

/**
 * VAT 포함 단가·수량 → 카트에 넣을 공급가 단가.
 * 단가를 먼저 ÷1.07 하면 수량 곱에서 잔차(예: 16,940→16,940.03)가 생기므로
 * 줄 합계(포함)를 먼저 구한 뒤 공급가 줄합÷수량으로 단가를 낸다.
 */
export function vatExclusiveUnitFromInclusiveUnit(unitInclusive: number, qty: number): number {
  const q = Number(qty)
  const safeQty = Number.isFinite(q) && q > 0 ? q : 1
  const inclLine = roundTo2(Number(unitInclusive || 0) * safeQty)
  const exclLine = vatExclusiveLineFromInclusiveLine(inclLine)
  return exclLine / safeQty
}
