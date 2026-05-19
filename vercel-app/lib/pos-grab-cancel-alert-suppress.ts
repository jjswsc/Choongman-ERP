/** 매장(POS)에서 Grab 거절 API를 호출한 직후 — 고객 취소 알림과 중복되지 않도록 */
const selfInitiatedGrabCancelOrderIds = new Set<number>()

export function markPosSelfInitiatedGrabCancel(orderId: number): void {
  const id = Math.trunc(Number(orderId))
  if (!Number.isFinite(id) || id <= 0) return
  selfInitiatedGrabCancelOrderIds.add(id)
  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      selfInitiatedGrabCancelOrderIds.delete(id)
    }, 20_000)
  }
}

/** true면 이번 취소는 매장 조작으로 간주해 고객 취소 팝업을 생략 */
export function consumePosSelfInitiatedGrabCancel(orderId: number): boolean {
  const id = Math.trunc(Number(orderId))
  if (!selfInitiatedGrabCancelOrderIds.has(id)) return false
  selfInitiatedGrabCancelOrderIds.delete(id)
  return true
}
