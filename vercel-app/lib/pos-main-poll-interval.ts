/**
 * 메인 POS 보조 폴링 간격 — Realtime이 1차, 폴링은 안전망(fallback)만 담당.
 *
 * 안전 우선 규칙:
 * - HEALTHY: Realtime INSERT 채널이 SUBSCRIBED 이면 heavy 180s (조용한 매장도 가속하지 않음).
 * - DEGRADED: Realtime 미연결 시 heavy(items_json) 15s + head(초경량) 10s.
 * - HEAD: items_json 없는 초경량 폴링으로 신규 id·updated_at 만 감시 → 변경 시 heavy 즉시 트리거.
 * - 2026-08-04 head(healthy 6s / degraded 3s)는 전 매장 getPosOrders 폭증으로 Fluid Active CPU가
 *   약 2배가 되어, healthy는 90s 안전망·degraded는 10s로 되돌림 (7/27 요금대 복구).
 * - `realtimeRecentlyActive`는 폴링 간격이 아니라 limit=800 풀 스캔 폴백(`shouldUseMainPosHeavyOrderScanFallback`)에만 사용.
 */
export const MAIN_POS_POLL_INTERVAL_HEALTHY_MS = 180_000
/** Realtime 정상 + 최근 이벤트 있음 → HTTP 폴링은 안전망만 (Edge Request 절감) */
export const MAIN_POS_POLL_INTERVAL_HEALTHY_ACTIVE_MS = 300_000
/**
 * Realtime 미연결·채널 실패 시 heavy(pollMinimal+items_json) 보조 폴링.
 * 5s 전체 목록 폴링은 Fluid CPU·전송 비용이 커서 15s 유지.
 */
export const MAIN_POS_POLL_INTERVAL_DEGRADED_MS = 15_000
/**
 * items_json 없는 head 폴링 (Realtime 실패 시).
 * 3s는 Active CPU 폭증 → 10s로 완화 (태블릿→메인 체감은 Realtime 복구가 1차).
 */
export const MAIN_POS_HEAD_POLL_INTERVAL_DEGRADED_MS = 10_000
/**
 * Realtime 정상인데 이벤트 누락(필터·tenant_id) 대비 초경량 안전망.
 * 6s 상시 폴링은 매장×단말 수만큼 getPosOrders를 돌려 Fluid Active CPU를 2배로 올림 → 90s.
 */
export const MAIN_POS_HEAD_POLL_INTERVAL_HEALTHY_MS = 90_000
/** Realtime 이벤트 없이 이 시간이 지나면 보조 폴링을 degraded 로 간주 */
export const MAIN_POS_REALTIME_STALE_MS = 90_000
/** 채널 오류 시 전체 재구독 최소 간격 (6/12 Realtime 활성화 후 alias 오류 폭주 방지) */
export const MAIN_POS_REALTIME_RESUBSCRIBE_MIN_MS = 60_000
export const MAIN_POS_REALTIME_RESUBSCRIBE_DELAY_MS = 15_000
/** Realtime 이벤트·채널 오류로 즉시 poll 호출 시 최소 간격 */
export const MAIN_POS_TRIGGER_POLL_MIN_MS = 5_000

export function resolveMainPosHeadPollIntervalMs(opts: {
  realtimeChannelHealthy: boolean
}): number {
  return opts.realtimeChannelHealthy
    ? MAIN_POS_HEAD_POLL_INTERVAL_HEALTHY_MS
    : MAIN_POS_HEAD_POLL_INTERVAL_DEGRADED_MS
}

export function mainPosPrimaryInsertChannelKey(storeCode: string): string {
  return `insert:${String(storeCode || '').trim()}`
}

export function resolveMainPosPollIntervalMs(opts: {
  realtimeChannelHealthy: boolean
  realtimeRecentlyActive: boolean
}): number {
  if (!opts.realtimeChannelHealthy) return MAIN_POS_POLL_INTERVAL_DEGRADED_MS
  if (opts.realtimeRecentlyActive) return MAIN_POS_POLL_INTERVAL_HEALTHY_ACTIVE_MS
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
