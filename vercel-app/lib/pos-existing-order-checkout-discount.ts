import type { PosOrder } from '@/lib/api-client'
import { resolveHallOrderReceiptDiscountAmt } from '@/lib/pos-hall-order-receipt-document-html'
import { computePosPricing, type PosPricingAdjustments } from '@/lib/pos-pricing'

/** 기존 pos_orders 행 결제 모달·영수증에 넘기는 할인·합계 스냅샷 */
export type PosExistingOrderCheckoutDiscount = {
  discountAmt?: number
  couponDiscountAmt?: number
  discountReason?: string
  serviceAmt?: number
  subtotal?: number
  total?: number
  deliveryFee?: number
  packagingFee?: number
  vat?: number
}

export type PosCheckoutDiscountSource = {
  discountAmt?: number
  couponDiscountAmt?: number
  discountReason?: string
  serviceAmt?: number
  subtotal?: number
  total?: number
  deliveryFee?: number
  packagingFee?: number
  vat?: number
  items?: Array<{ price: number; quantity?: number; qty?: number }>
}

export function posOrderToCheckoutDiscountSnapshot(
  order: PosCheckoutDiscountSource | PosOrder
): PosExistingOrderCheckoutDiscount {
  let subtotal = Math.max(0, Number(order.subtotal ?? 0) || 0)
  const lineItems = 'items' in order && Array.isArray(order.items) ? order.items : []
  if (subtotal <= 0.005 && lineItems.length > 0) {
    subtotal = lineItems.reduce(
      (sum, it) =>
        sum +
        Math.max(0, Number(it.price) || 0) * Math.max(0, Number(it.quantity ?? it.qty ?? 1) || 1),
      0
    )
  }
  return {
    discountAmt: Number(order.discountAmt ?? 0) || 0,
    couponDiscountAmt: Number(order.couponDiscountAmt ?? 0) || 0,
    discountReason: String(order.discountReason ?? '').trim() || undefined,
    serviceAmt: Number(order.serviceAmt ?? 0) || 0,
    subtotal,
    total: Number(order.total ?? 0) || 0,
    deliveryFee: Number(order.deliveryFee ?? 0) || 0,
    packagingFee: Number(order.packagingFee ?? 0) || 0,
    vat: Number(order.vat ?? 0) || 0,
  }
}

type CheckoutDiscountLine = {
  price: number
  qty?: number
  quantity?: number
  lineDiscountAmt?: number
}

/** 주문서·결제 영수증 공통 — DB·플랫폼 합계 기준 유효 할인액 */
export function resolveEffectivePosOrderDiscountAmt(params: {
  snapshot: PosExistingOrderCheckoutDiscount
  items: CheckoutDiscountLine[]
  adjustments?: PosPricingAdjustments
}): number {
  const { snapshot, items, adjustments } = params
  const subtotalFromItems = (items || []).reduce(
    (sum, it) =>
      sum + Math.max(0, Number(it.price) || 0) * Math.max(0, Number(it.qty ?? it.quantity ?? 1) || 1),
    0
  )
  const subtotal = Math.max(0, Number(snapshot.subtotal) || 0) || subtotalFromItems
  const explicitDiscount = Math.max(0, Number(snapshot.discountAmt) || 0)
  const pricing = computePosPricing({
    subtotal,
    discountAmt: explicitDiscount,
    deliveryFee: Math.max(0, Number(snapshot.deliveryFee) || 0),
    packagingFee: Math.max(0, Number(snapshot.packagingFee) || 0),
    adjustments: adjustments ?? {},
  })
  const storedTotal = Math.max(0, Number(snapshot.total) || 0)
  const hallItems = (items || []).map((it) => ({
    price: Number(it.price) || 0,
    qty: Math.max(0, Number(it.qty ?? it.quantity ?? 1) || 1),
    ...(Math.max(0, Number(it.lineDiscountAmt) || 0) > 0.0001
      ? { lineDiscountAmt: Math.max(0, Number(it.lineDiscountAmt) || 0) }
      : {}),
  }))
  return resolveHallOrderReceiptDiscountAmt({
    discountAmt: explicitDiscount,
    couponDiscountAmt: Math.max(0, Number(snapshot.couponDiscountAmt) || 0),
    items: hallItems,
    subtotal,
    total: storedTotal > 0.005 ? storedTotal : pricing.finalTotal,
    deliveryFee: Math.max(0, Number(snapshot.deliveryFee) || 0),
    packagingFee: Math.max(0, Number(snapshot.packagingFee) || 0),
    vatFeeAmt: pricing.vatFeeAmt,
    vatFeeMode: pricing.vatFeeMode,
  })
}

/** 결제 모달 수동 할인 입력 초기값(금액 할인) */
export function manualDiscountSeedFromCheckoutSnapshot(params: {
  snapshot: PosExistingOrderCheckoutDiscount
  items: CheckoutDiscountLine[]
  adjustments?: PosPricingAdjustments
}): { discountValue: number; discountReason: string } {
  const discountValue = resolveEffectivePosOrderDiscountAmt(params)
  return {
    discountValue,
    discountReason: String(params.snapshot.discountReason ?? '').trim(),
  }
}
