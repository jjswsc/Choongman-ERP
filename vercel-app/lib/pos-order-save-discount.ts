import { coercePosReceiptLineDiscountAmt } from '@/lib/pos-receipt-line-discount'

/** savePosOrder/updatePosOrder — items_json 품목 lineDiscountAmt 합 */
export function sumPosOrderItemsLineDiscountAmt(items: unknown[]): number {
  if (!Array.isArray(items) || items.length === 0) return 0
  return items.reduce<number>((sum, it) => sum + coercePosReceiptLineDiscountAmt(it), 0)
}

/**
 * 저장 API — 헤더 discountAmt(−service)와 품목 lineDiscountAmt 중 큰 값.
 * 카트가 lineDiscountAmt만 보내고 discountAmt=0인 경우 total·discount_amt 정합.
 */
export function resolveManualDiscountNetForOrderSave(params: {
  discountAmt: number
  serviceAmt: number
  items: unknown[]
}): number {
  const service = Math.max(0, Number(params.serviceAmt ?? 0) || 0)
  const headerNet = Math.max(0, Number(params.discountAmt ?? 0) || 0) - service
  const lineSum = sumPosOrderItemsLineDiscountAmt(params.items)
  return Math.max(headerNet, lineSum)
}

/**
 * 영수증·홀 주문서 합계 — DB total이 할인·결제와 어긋나면 pricing 재계산값 우선.
 */
export function resolvePosOrderReceiptPrintTotal(params: {
  storedTotal: number
  pricingFinalTotal: number
  effectiveDiscountAmt: number
  paymentSum: number
}): number {
  const stored = Math.max(0, Number(params.storedTotal ?? 0) || 0)
  const computed = Math.max(0, Number(params.pricingFinalTotal ?? 0) || 0)
  const paySum = Math.max(0, Number(params.paymentSum ?? 0) || 0)
  const discount = Math.max(0, Number(params.effectiveDiscountAmt ?? 0) || 0)

  if (stored <= 0.005) return computed
  if (Math.abs(stored - computed) <= 0.02) return stored

  if (discount > 0.02 && stored > computed + 0.02) return computed
  if (paySum > 0.005 && Math.abs(paySum - computed) <= 0.02 && stored > computed + 0.02) {
    return computed
  }

  return stored
}
