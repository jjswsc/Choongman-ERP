/**
 * 오프라인 큐에서 savePosOrder 가 서버에 반영된 직후, Realtime/폴링이 같은 주문을
 * 「신규」로 보고 자동 인쇄를 한 번 더 때리는 것을 막기 위한 일회성 집합.
 *
 * 단, "로컬에서 실제 자동 인쇄를 시도한 큐 주문(localOrderNo)" 에 대해서만 suppress 한다.
 * - 메인 POS가 아닌 태블릿(보조 주문 단말)에서 올라온 큐 주문은 suppress 하지 않아,
 *   메인 POS Realtime/폴링이 정상 인쇄를 수행하도록 한다.
 */

const syncedServerOrderIds = new Set<number>()
const locallyPrintedQueuedLocalNos = new Set<string>()

function normalizeLocalOrderNo(raw: string | null | undefined): string {
  return String(raw ?? '').trim()
}

/** 로컬에서 자동 인쇄를 시도한 큐 주문 번호를 기록 */
export function registerLocallyPrintedQueuedOrderNo(localOrderNo: string | null | undefined) {
  const no = normalizeLocalOrderNo(localOrderNo)
  if (!no) return
  locallyPrintedQueuedLocalNos.add(no)
}

export function registerQueuedSavePosOrderSyncedServerId(
  orderId: number,
  localOrderNo?: string | null
) {
  if (!Number.isFinite(orderId) || orderId <= 0) return
  const no = normalizeLocalOrderNo(localOrderNo)
  // localOrderNo가 있으면 "로컬 인쇄 시도된 큐 주문"일 때만 suppress 후보로 등록
  if (no) {
    if (!locallyPrintedQueuedLocalNos.has(no)) return
    locallyPrintedQueuedLocalNos.delete(no)
  }
  syncedServerOrderIds.add(orderId)
}

/**
 * @returns true 이면 이 orderId 에 대한 메인포스 자동 인쇄를 이번에 건너뛴다(소비).
 */
export function consumeSuppressMainPosAutoPrintForQueuedSync(orderId: number): boolean {
  if (!syncedServerOrderIds.has(orderId)) return false
  syncedServerOrderIds.delete(orderId)
  return true
}
