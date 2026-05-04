import type { Order, OrderItem } from '@/lib/pos-types'
import type { PosOrderItem } from '@/lib/api-client'
import { posOrderHasServerId } from '@/lib/pos-order-server-id'
import { extractGrabOrderIdFromMemo } from '@/lib/grab-order-memo'

export function orderPaymentsSum(order: Order): number {
  return (
    Math.max(0, Number(order.paymentCash ?? 0) || 0) +
    Math.max(0, Number(order.paymentCard ?? 0) || 0) +
    Math.max(0, Number(order.paymentQr ?? 0) || 0) +
    Math.max(0, Number(order.paymentOther ?? 0) || 0) +
    Math.max(0, Number(order.paymentDeliveryApp ?? 0) || 0)
  )
}

/**
 * 결제 반영 전·Grab 연동 배달 제외 시, `updatePosOrder`로 줄을 빼 수정 가능한지.
 * 마지막 한 줄만 남은 경우는 API가 빈 items를 거절하므로 false (전체 주문 취소 유도).
 */
export function canRemovePosOrderLine(order: Order | null, opts?: { allowGrabLinked?: boolean }): boolean {
  if (!order?.items?.length) return false
  if (order.items.length <= 1) return false
  if (!posOrderHasServerId(order.id)) return false
  const st = String(order.status ?? '').toLowerCase()
  if (st === 'completed' || st === 'cancelled' || st === 'paid') return false
  if (orderPaymentsSum(order) > 0.005) return false
  if (!opts?.allowGrabLinked) {
    const grabId = extractGrabOrderIdFromMemo(String(order.memo ?? ''))
    if (grabId) return false
  }
  return true
}

export function orderItemsToPosOrderItems(items: OrderItem[]): PosOrderItem[] {
  return items.map((it) => {
    const menuId = String(it.menuId ?? '').trim()
    const optionId = String(it.optionId ?? '').trim()
    const base: PosOrderItem = {
      id: String(it.id ?? ''),
      name: String(it.name ?? ''),
      price: Number(it.price ?? 0) || 0,
      qty: Math.max(1, Math.trunc(Number(it.quantity) || 1)),
    }
    const note = String(it.note ?? '').trim()
    if (note) base.note = note
    if (menuId) base.menuId1 = menuId
    if (optionId) base.optionId1 = optionId
    if (it.promoId && Array.isArray(it.promoItems) && it.promoItems.length > 0) {
      base.promoId = String(it.promoId)
      if (it.promoCode) base.promoCode = String(it.promoCode)
      base.promoItems = it.promoItems
    }
    const lineApp = String(it.deliveryAppCode ?? '').trim()
    if (lineApp) base.deliveryAppCode = lineApp
    if (typeof it.servedAt === 'string' && it.servedAt) base.servedAt = it.servedAt
    if (typeof it.servedBy === 'string' && it.servedBy) base.servedBy = it.servedBy
    if (typeof it.cancelledAt === 'string' && it.cancelledAt) base.cancelledAt = it.cancelledAt
    if (typeof it.cancelledBy === 'string' && it.cancelledBy) base.cancelledBy = it.cancelledBy
    if (typeof it.cancelReason === 'string' && it.cancelReason) base.cancelReason = it.cancelReason
    return base
  })
}

/** `updatePosOrder` 호출용 — 결제·할인 등 기존 주문 값 유지 */
export function buildUpdatePosOrderParamsFromOrder(order: Order, nextItems: PosOrderItem[]) {
  const params: {
    id: number
    items: PosOrderItem[]
    tableName?: string
    memo: string
    discountAmt: number
    discountReason: string
    paymentCash: number
    paymentCard: number
    paymentQr: number
    paymentOther: number
    paymentDeliveryApp: number
    deliveryPaymentChannel: string | null
    memberId: number
    memberNo: string
    couponCode: string
    couponDiscountAmt: number
    pointUsed: number
    pointEarned: number
    guestCount?: number
  } = {
    id: Number(order.id),
    items: nextItems,
    tableName: order.tableName?.trim() || undefined,
    memo: String(order.memo ?? '').trim(),
    discountAmt: Math.max(0, Number(order.discountAmt ?? 0) || 0),
    discountReason: String(order.discountReason ?? '').trim(),
    paymentCash: Math.max(0, Number(order.paymentCash ?? 0) || 0),
    paymentCard: Math.max(0, Number(order.paymentCard ?? 0) || 0),
    paymentQr: Math.max(0, Number(order.paymentQr ?? 0) || 0),
    paymentOther: Math.max(0, Number(order.paymentOther ?? 0) || 0),
    paymentDeliveryApp: Math.max(0, Number(order.paymentDeliveryApp ?? 0) || 0),
    deliveryPaymentChannel: order.deliveryPaymentChannel?.trim()
      ? String(order.deliveryPaymentChannel).trim().toLowerCase()
      : null,
    memberId: Math.max(0, Math.trunc(Number(order.memberId ?? 0) || 0)),
    memberNo: String(order.memberNo ?? '').trim(),
    couponCode: String(order.couponCode ?? '').trim().toUpperCase(),
    couponDiscountAmt: Math.max(0, Number(order.couponDiscountAmt ?? 0) || 0),
    pointUsed: Math.max(0, Math.trunc(Number(order.pointUsed ?? 0) || 0)),
    pointEarned: Math.max(0, Math.trunc(Number(order.pointEarned ?? 0) || 0)),
  }
  if (order.type === 'dine-in') {
    const g = Math.trunc(Number(order.guestCount ?? 0) || 0)
    if (!Number.isNaN(g)) params.guestCount = Math.max(0, Math.min(99, g))
  }
  return params
}
