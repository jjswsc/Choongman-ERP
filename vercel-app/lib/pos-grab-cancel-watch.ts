import { extractGrabOrderIdFromMemo, extractGrabStateFromMemo } from '@/lib/grab-order-memo'

export type GrabCancelWatchSnap = {
  status: string
  grabState: string | null
}

export type GrabCancelWatchOrderLike = {
  id?: unknown
  status?: unknown
  memo?: unknown
  orderType?: unknown
  order_type?: unknown
}

function isCancelledSnap(snap: GrabCancelWatchSnap): boolean {
  const st = snap.status
  if (st === 'cancelled' || st === 'canceled' || st === 'refunded') return true
  const gs = String(snap.grabState ?? '').toUpperCase()
  return gs === 'CANCELLED' || gs === 'FAILED'
}

export function grabCancelSnapFromPosOrder(order: GrabCancelWatchOrderLike): GrabCancelWatchSnap | null {
  const memo = String(order.memo ?? '')
  if (!extractGrabOrderIdFromMemo(memo)) return null
  const ot = String(order.orderType ?? order.order_type ?? '').trim().toLowerCase()
  if (ot && ot !== 'delivery') return null
  return {
    status: String(order.status ?? '').trim().toLowerCase(),
    grabState: extractGrabStateFromMemo(memo),
  }
}

export function didGrabCustomerCancelTransition(
  prev: GrabCancelWatchSnap | undefined,
  next: GrabCancelWatchSnap
): boolean {
  if (!prev) return false
  return isCancelledSnap(next) && !isCancelledSnap(prev)
}

/** seedOnly: 현재 상태만 기록(알림 없음). false: 이전 스냅샷 대비 신규 취소 주문 id 반환 */
export function syncGrabCancelWatchSnapshot(
  orders: GrabCancelWatchOrderLike[],
  snapshot: Map<number, GrabCancelWatchSnap>,
  opts: { seedOnly?: boolean }
): number[] {
  const newlyCancelled: number[] = []
  for (const order of orders) {
    const id = Math.trunc(Number(order.id ?? 0))
    if (!Number.isFinite(id) || id <= 0) continue
    const snap = grabCancelSnapFromPosOrder(order)
    if (!snap) continue
    const prev = snapshot.get(id)
    if (opts.seedOnly) {
      snapshot.set(id, snap)
      continue
    }
    if (prev && didGrabCustomerCancelTransition(prev, snap)) {
      newlyCancelled.push(id)
    }
    snapshot.set(id, snap)
  }
  return newlyCancelled
}

export function applyGrabCancelWatchRealtimeRow(params: {
  orderId: number
  row: GrabCancelWatchOrderLike
  snapshot: Map<number, GrabCancelWatchSnap>
  seeded: boolean
}): boolean {
  const snap = grabCancelSnapFromPosOrder(params.row)
  if (!snap) return false
  const prev = params.snapshot.get(params.orderId)
  params.snapshot.set(params.orderId, snap)
  if (!params.seeded) return false
  return Boolean(prev && didGrabCustomerCancelTransition(prev, snap))
}
