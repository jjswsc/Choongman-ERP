import type { Order } from '@/lib/pos-types'
import { isPosOfflineOnlyOrder, posOrderHasServerId } from '@/lib/pos-order-server-id'
import { isActiveTerminalListOrder } from '@/lib/pos-terminal-active-orders-persist'

/** refetch 스냅샷에 없는 in-memory 주문을 다시 붙일지 — 서버 id 주문은 취소·종료로 간주 */
export function shouldKeepPrevOrderMissingFromFetched(row: Order): boolean {
  if (!isActiveTerminalListOrder(row)) return false
  if (posOrderHasServerId(row.id)) return false
  if (isPosOfflineOnlyOrder(row)) return true
  if (row.pendingListSync) return true
  return true
}

export function isCancelledOrRefundedTerminalOrder(order: Order | undefined | null): boolean {
  const st = String(order?.status ?? '').trim().toLowerCase()
  return st === 'cancelled' || st === 'canceled' || st === 'refunded'
}

function orderItemQtySum(order: Order): number {
  if (!order.items?.length) return 0
  return order.items.reduce((sum, it) => sum + Math.max(0, Number(it.quantity ?? 1) || 1), 0)
}

function ordersLikelySameSnapshot(a: Order, b: Order): boolean {
  if (a.type !== b.type) return false
  const tableA = String(a.tableName ?? a.customerName ?? '').trim()
  const tableB = String(b.tableName ?? b.customerName ?? '').trim()
  if (tableA && tableB && tableA !== tableB) return false
  const totalDiff = Math.abs(Number(a.total ?? 0) - Number(b.total ?? 0))
  if (totalDiff > 2) return false
  const qtyDiff = Math.abs(orderItemQtySum(a) - orderItemQtySum(b))
  return qtyDiff <= 1
}

/** 서버에 동일 테이블·유형 주문이 잡히면 LOCAL/큐 스냅샷은 merge 대상에서 제외 */
export function dropStaleOfflineOrdersWhenServerHasMatch(
  fetched: Order[],
  prev: Order[]
): Order[] {
  if (!prev.length || !fetched.length) return prev
  const serverActive = fetched.filter(
    (row) => posOrderHasServerId(row.id) && isActiveTerminalListOrder(row)
  )
  if (serverActive.length === 0) return prev

  return prev.filter((prevRow) => {
    if (!isPosOfflineOnlyOrder(prevRow)) return true
    const duplicate = serverActive.some((srv) => ordersLikelySameSnapshot(prevRow, srv))
    return !duplicate
  })
}
