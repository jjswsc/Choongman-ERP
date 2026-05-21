import type { Order, OrderItem } from '@/lib/pos-types'
import type { PosOrderItem } from '@/lib/api-client'
import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
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

function posOrderLineEditBlocked(order: Order, opts?: { allowGrabLinked?: boolean }): boolean {
  if (!posOrderHasServerId(order.id)) return true
  const st = String(order.status ?? '').toLowerCase()
  if (st === 'completed' || st === 'cancelled' || st === 'paid') return true
  if (orderPaymentsSum(order) > 0.005) return true
  if (!opts?.allowGrabLinked) {
    const grabId = extractGrabOrderIdFromMemo(String(order.memo ?? ''))
    if (grabId) return true
  }
  return false
}

function activeOrderItems(order: Order): OrderItem[] {
  return (order.items || []).filter((it) => !String(it.cancelledAt ?? '').trim())
}

/**
 * 일부 취소(수량 선택 포함) 시작 가능 여부.
 * 줄이 1개만 남아도 수량이 2 이상이면 수량만 줄이는 취소는 허용.
 */
export function canStartPosLinePartialCancel(
  order: Order | null,
  opts?: { allowGrabLinked?: boolean }
): boolean {
  if (!order?.items?.length) return false
  if (posOrderLineEditBlocked(order, opts)) return false
  const active = activeOrderItems(order)
  if (!active.length) return false
  if (active.length > 1) return true
  const q = resolveCartLineQuantityForSave(active[0] as { quantity?: unknown; qty?: unknown })
  return q > 1
}

/**
 * 결제 반영 전·Grab 연동 배달 제외 시, `updatePosOrder`로 줄을 빼 수정 가능한지.
 * 마지막 한 줄만 남은 경우는 API가 빈 items를 거절하므로 false (전체 주문 취소 유도).
 */
export function canRemovePosOrderLine(order: Order | null, opts?: { allowGrabLinked?: boolean }): boolean {
  if (!order?.items?.length) return false
  if (order.items.length <= 1) return false
  if (posOrderLineEditBlocked(order, opts)) return false
  return true
}

export function orderItemsToPosOrderItems(items: OrderItem[]): PosOrderItem[] {
  return items.map((it) => {
    const menuId = String(it.menuId ?? '').trim()
    const optionId = String(it.optionId ?? '').trim()
    const q = resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown })
    const base: PosOrderItem = {
      id: String(it.id ?? ''),
      name: String(it.name ?? ''),
      price: Number(it.price ?? 0) || 0,
      qty: q,
      quantity: q,
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
    if (it.setChildrenState && typeof it.setChildrenState === 'object' && !Array.isArray(it.setChildrenState)) {
      base.setChildrenState = it.setChildrenState
    }
    const lineApp = String(it.deliveryAppCode ?? '').trim()
    if (lineApp) base.deliveryAppCode = lineApp
    if (typeof it.servedAt === 'string' && it.servedAt) base.servedAt = it.servedAt
    if (typeof it.servedBy === 'string' && it.servedBy) base.servedBy = it.servedBy
    if (typeof it.cancelledAt === 'string' && it.cancelledAt) base.cancelledAt = it.cancelledAt
    if (typeof it.cancelledBy === 'string' && it.cancelledBy) base.cancelledBy = it.cancelledBy
    if (typeof it.cancelReason === 'string' && it.cancelReason) base.cancelReason = it.cancelReason
    const lineDiscountAmt = Math.max(
      0,
      Number((it as { lineDiscountAmt?: unknown }).lineDiscountAmt ?? 0) || 0
    )
    if (lineDiscountAmt > 0.0001) base.lineDiscountAmt = lineDiscountAmt
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
