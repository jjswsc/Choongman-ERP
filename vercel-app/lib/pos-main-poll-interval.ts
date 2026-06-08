/** 메인 POS 폴링 — Realtime 정상 시 간격을 늘리고, 끊김·오류 시만 촘촘히 */
export const MAIN_POS_POLL_INTERVAL_HEALTHY_MS = 45_000
export const MAIN_POS_POLL_INTERVAL_DEGRADED_MS = 8_000
/** Realtime 이벤트 없이 이 시간이 지나면 보조 폴링을 degraded 로 간주 */
export const MAIN_POS_REALTIME_STALE_MS = 90_000

export function resolveMainPosPollIntervalMs(opts: {
  realtimeChannelHealthy: boolean
  realtimeRecentlyActive: boolean
}): number {
  if (!opts.realtimeChannelHealthy) return MAIN_POS_POLL_INTERVAL_DEGRADED_MS
  if (!opts.realtimeRecentlyActive) return MAIN_POS_POLL_INTERVAL_DEGRADED_MS
  return MAIN_POS_POLL_INTERVAL_HEALTHY_MS
}

export function isMainPosRealtimeRecentlyActive(
  lastEventAtMs: number,
  nowMs: number = Date.now()
): boolean {
  if (!lastEventAtMs || lastEventAtMs <= 0) return false
  return nowMs - lastEventAtMs < MAIN_POS_REALTIME_STALE_MS
}

/** Realtime 정상·최근 이벤트 있음 → limit 800 풀 스캔(메타·결제 영수증) 폴백 불필요 */
export function shouldUseMainPosHeavyOrderScanFallback(opts: {
  realtimeChannelHealthy: boolean
  lastRealtimeOrderEventAtMs: number
  nowMs?: number
}): boolean {
  if (!opts.realtimeChannelHealthy) return true
  return !isMainPosRealtimeRecentlyActive(opts.lastRealtimeOrderEventAtMs, opts.nowMs)
}
