/**
 * 메인 POS 보조 폴링 간격 — Realtime이 1차, 폴링은 안전망(fallback)만 담당.
 *
 * 안전 우선 규칙:
 * - HEALTHY: Realtime INSERT 채널이 SUBSCRIBED 이면 60s (조용한 매장도 8s 가속하지 않음).
 * - DEGRADED(15s): Realtime 미연결·전 INSERT 채널 실패 시만.
 * - `realtimeRecentlyActive`는 폴링 간격이 아니라 limit=800 풀 스캔 폴백(`shouldUseMainPosHeavyOrderScanFallback`)에만 사용.
 */
export const MAIN_POS_POLL_INTERVAL_HEALTHY_MS = 90_000
export const MAIN_POS_POLL_INTERVAL_DEGRADED_MS = 15_000
/** Realtime 이벤트 없이 이 시간이 지나면 보조 폴링을 degraded 로 간주 */
export const MAIN_POS_REALTIME_STALE_MS = 90_000
/** 채널 오류 시 전체 재구독 최소 간격 (6/12 Realtime 활성화 후 alias 오류 폭주 방지) */
export const MAIN_POS_REALTIME_RESUBSCRIBE_MIN_MS = 60_000
export const MAIN_POS_REALTIME_RESUBSCRIBE_DELAY_MS = 15_000
/** Realtime 이벤트·채널 오류로 즉시 poll 호출 시 최소 간격 */
export const MAIN_POS_TRIGGER_POLL_MIN_MS = 5_000

export function mainPosPrimaryInsertChannelKey(storeCode: string): string {
  return `insert:${String(storeCode || '').trim()}`
}

export function resolveMainPosPollIntervalMs(opts: {
  realtimeChannelHealthy: boolean
  realtimeRecentlyActive: boolean
}): number {
  void opts.realtimeRecentlyActive
  if (!opts.realtimeChannelHealthy) return MAIN_POS_POLL_INTERVAL_DEGRADED_MS
  return MAIN_POS_POLL_INTERVAL_HEALTHY_MS
}

export function isMainPosRealtimeRecentlyActive(
  lastEventAtMs: number,
  nowMs: number = Date.now()
): boolean {
  if (!lastEventAtMs || lastEventAtMs <= 0) return false
  return nowMs - lastEventAtMs < MAIN_POS_REALTIME_STALE_MS
}

/**
 * 매장 store_code 별칭(legacy·Grab ID)마다 INSERT/UPDATE 채널을 열어도,
 * INSERT 채널 하나라도 SUBSCRIBED 이면 Realtime 정상으로 본다.
 * (별칭 1개 TIMED_OUT 때문에 전 매장 8초 폴링으로 떨어지는 비용 버그 방지)
 */
export function isMainPosRealtimeInsertChannelHealthy(
  channelStates: ReadonlyMap<string, string> | Iterable<readonly [string, string]>
): boolean {
  for (const [key, status] of channelStates) {
    if (String(key).startsWith('insert:') && status === 'SUBSCRIBED') return true
  }
  return false
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
