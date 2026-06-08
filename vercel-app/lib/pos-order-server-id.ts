import type { Order } from '@/lib/pos-types'

/**
 * 오프라인 큐에만 있는 주문은 임시 음수 id 를 쓰므로,
 * 서버 행이 있는 주문만 update/mark API 를 호출해야 한다.
 */
export function posOrderHasServerId(orderId: string | number | undefined | null): boolean {
  const n = Number(orderId)
  return Number.isFinite(n) && n > 0
}

export function isPosLocalClientOrderNo(value: string | undefined | null): boolean {
  const s = String(value ?? '').trim()
  return s.startsWith('LOCAL-') || s.startsWith('pos-')
}

export function isPosSyntheticQueueOrderId(orderId: string | number | undefined | null): boolean {
  const n = Number(orderId)
  return Number.isFinite(n) && n < 0
}

export function extractPosLocalOrderNo(order: Pick<Order, 'id' | 'orderNo'>): string | null {
  const no = String(order.orderNo ?? '').trim()
  if (isPosLocalClientOrderNo(no)) return no
  const id = String(order.id ?? '').trim()
  if (isPosLocalClientOrderNo(id)) return id
  return null
}

/** LOCAL/pos-* 번호·음수 큐 id 등 — DB pos_orders.id 가 아직 없는 주문 */
export function isPosOfflineOnlyOrder(order: Pick<Order, 'id' | 'orderNo'>): boolean {
  if (posOrderHasServerId(order.id)) return false
  if (extractPosLocalOrderNo(order)) return true
  if (isPosSyntheticQueueOrderId(order.id)) return true
  const id = String(order.id ?? '').trim().toLowerCase()
  return id.startsWith('local-')
}
