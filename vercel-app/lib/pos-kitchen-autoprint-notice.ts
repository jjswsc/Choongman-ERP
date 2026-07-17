/**
 * 주방 자동인쇄 실패를 현장에서 바로 인지할 수 있게 분류한다.
 * (빈 슬립·주방 미인쇄만 해당하면 알림하지 않음)
 */

export type KitchenAutoprintFailureKind = 'skip' | 'network' | 'print' | 'other'

export function classifyKitchenAutoprintFailure(error: unknown): KitchenAutoprintFailureKind {
  const message = (error instanceof Error ? error.message : String(error ?? '')).trim().toLowerCase()
  if (!message || message === 'no_slips_to_print' || message === 'empty_order_items') {
    return 'skip'
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'network'
  }
  if (message === 'print_unavailable') return 'print'
  if (
    /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|abort|econnreset|enotfound|offline|err_network|err_internet|err_connection/i.test(
      message
    )
  ) {
    return 'network'
  }
  return 'other'
}

/** 장애 시 알림 폭주 방지 — 같은 매장 POS에서 연속 실패해도 짧게만 한 번 더 보여 줌 */
export function shouldShowKitchenAutoprintNotice(
  lastShownAtMs: number,
  nowMs = Date.now(),
  cooldownMs = 25_000
): boolean {
  if (!Number.isFinite(lastShownAtMs) || lastShownAtMs <= 0) return true
  return nowMs - lastShownAtMs >= cooldownMs
}
