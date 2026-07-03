import type { OrderItem } from '@/lib/pos-types'
import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
import type { KitchenSlipRoutingItem } from '@/lib/pos-kitchen-slip-routing'
import { kitchenRoutingItemFromOrderItem } from '@/lib/pos-kitchen-slip-routing'
import { resolvePosOrderLineIndex } from '@/lib/pos-order-line-keys'

export function orderItemLineQty(it: OrderItem): number {
  return Math.max(1, Math.trunc(resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown })))
}

export function orderItemHasPromoOrSet(it: OrderItem): boolean {
  if (String(it.promoId ?? '').trim()) return true
  if (Array.isArray(it.promoItems) && it.promoItems.length > 0) return true
  const sc = it.setChildrenState
  return Boolean(sc && typeof sc === 'object' && !Array.isArray(sc) && Object.keys(sc).length > 0)
}

/** 수량 감소 후 줄 필드 조정 (할인 비례, promo/set 스냅샷 유지) */
export function scalePosLineFieldsForQtyReduce<T extends OrderItem>(
  item: T,
  oldQty: number,
  newQty: number
): T {
  if (newQty >= oldQty || newQty < 1) return item
  const ratio = newQty / oldQty
  const lineDiscountAmt = Math.max(
    0,
    Number((item as { lineDiscountAmt?: unknown }).lineDiscountAmt ?? 0) || 0
  )
  const next: T = { ...item, quantity: newQty }
  if (lineDiscountAmt > 0.0001) {
    const scaled = Math.round(lineDiscountAmt * ratio * 100) / 100
    ;(next as { lineDiscountAmt?: number }).lineDiscountAmt = scaled > 0.0001 ? scaled : undefined
  }
  return next
}

export type BuildOrderItemsAfterLineCancelResult = {
  items: OrderItem[]
  /** 줄 전체 삭제(필터) vs 수량만 감소 */
  mode: 'remove_line' | 'reduce_qty'
  remainingQty: number
}

/**
 * `cancelQty`개 취소 반영한 다음 `items` 스냅샷.
 * `cancelQty === lineQty`이면 해당 id 줄 제거, 아니면 수량만 감소.
 */
export function buildOrderItemsAfterLineCancel(
  items: OrderItem[],
  itemId: string,
  cancelQty: number
): BuildOrderItemsAfterLineCancelResult | null {
  const idx = resolvePosOrderLineIndex(items, itemId)
  if (idx < 0) return null
  const target = items[idx]!
  const lineQty = orderItemLineQty(target)
  const cq = Math.max(1, Math.min(lineQty, Math.trunc(cancelQty) || 1))
  if (cq >= lineQty) {
    return {
      items: items.filter((_, i) => i !== idx),
      mode: 'remove_line',
      remainingQty: 0,
    }
  }
  const newQty = lineQty - cq
  return {
    items: items.map((it, i) =>
      i === idx ? scalePosLineFieldsForQtyReduce(it, lineQty, newQty) : it
    ),
    mode: 'reduce_qty',
    remainingQty: newQty,
  }
}

/** 취소 후 활성 줄이 0개가 되는지 (API `items.length === 0` 방지) */
export function wouldLeaveNoItemsAfterLineCancel(
  items: OrderItem[],
  itemId: string,
  cancelQty: number
): boolean {
  const built = buildOrderItemsAfterLineCancel(items, itemId, cancelQty)
  if (!built) return true
  const active = built.items.filter((it) => !String(it.cancelledAt ?? '').trim())
  return active.length < 1
}

/** 주방 취소 슬립용 — 취소 수량만 반영 */
export function kitchenRemovedLineFromOrderItem(
  it: OrderItem,
  displayName: string,
  cancelQty: number
): KitchenSlipRoutingItem {
  const row = kitchenRoutingItemFromOrderItem(it, displayName)
  const cq = Math.max(1, Math.trunc(cancelQty) || 1)
  return { ...row, qty: Math.min(cq, orderItemLineQty(it)) }
}
