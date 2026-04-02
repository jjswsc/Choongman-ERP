/**
 * 오프라인 큐에서 savePosOrder 가 서버에 반영된 직후, Realtime/폴링이 같은 주문을
 * 「신규」로 보고 자동 인쇄를 한 번 더 때리는 것을 막기 위한 일회성 집합.
 */

const syncedServerOrderIds = new Set<number>()

export function registerQueuedSavePosOrderSyncedServerId(orderId: number) {
  if (Number.isFinite(orderId) && orderId > 0) syncedServerOrderIds.add(orderId)
}

/**
 * @returns true 이면 이 orderId 에 대한 메인포스 자동 인쇄를 이번에 건너뛴다(소비).
 */
export function consumeSuppressMainPosAutoPrintForQueuedSync(orderId: number): boolean {
  if (!syncedServerOrderIds.has(orderId)) return false
  syncedServerOrderIds.delete(orderId)
  return true
}
