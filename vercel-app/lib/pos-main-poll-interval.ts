/**
 * 메인 POS 보조 폴링 간격 — Realtime이 1차, 폴링은 안전망(fallback)만 담당.
 *
 * 안전 우선 규칙:
 * - HEALTHY + 최근 Realtime 이벤트: head API 없음 (요금 절감). Realtime이 즉시 반영.
 * - HEALTHY + 이벤트 공백(≥90s): 초경량 head 45s — Realtime 무음·누락 시 조회 지연 방지.
 * - DEGRADED: heavy 15s + head 15s.
 * - 2026-08-04 head(healthy 6s) → Fluid Active CPU 약 2배.
 * - 8/6 90s 완화, 8/9 healthy head 전면 중지 → 현장 조회 체감이 너무 느려져
 *   “최근 이벤트 있을 때만 중지”로 재조정 (상시 6s 폭주는 유지 금지).
 * - `realtimeRecentlyActive`는 heavy 간격·head fetch 여부·limit=800 폴백에 사용.
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
 * heavy와 같은 15s — 변경 감지 후 즉시 heavy 트리거.
 */
export const MAIN_POS_HEAD_POLL_INTERVAL_DEGRADED_MS = 15_000
/**
 * Realtime 채널은 정상인데 최근 이벤트가 없을 때(무음·필터 누락) 초경량 안전망.
 * 6s는 요금 폭주, 완전 중지는 조회 지연 → 45s.
 */
export const MAIN_POS_HEAD_POLL_INTERVAL_HEALTHY_SPARSE_MS = 45_000
/**
 * Realtime이 활발할 때 head API를 치지 않음. 스케줄러만 이 간격으로 상태 재평가.
 */
export const MAIN_POS_HEAD_POLL_HEALTHY_RECHECK_MS = 60_000
/** Realtime 이벤트 없이 이 시간이 지나면 보조 폴링을 degraded/sparse 로 간주 */
export const MAIN_POS_REALTIME_STALE_MS = 90_000
/** 채널 오류 시 전체 재구독 최소 간격 (6/12 Realtime 활성화 후 alias 오류 폭주 방지) */
export const MAIN_POS_REALTIME_RESUBSCRIBE_MIN_MS = 60_000
export const MAIN_POS_REALTIME_RESUBSCRIBE_DELAY_MS = 15_000
/** Realtime 이벤트·채널 오류로 즉시 poll 호출 시 최소 간격 */
export const MAIN_POS_TRIGGER_POLL_MIN_MS = 5_000
/** 오픈 전·마감 후 인터벌 폴링을 멈춘 뒤 게이트만 재확인 */
export const MAIN_POS_POLL_INTERVAL_PAUSED_MS = 60_000

/** 당일 마감, 또는 어제 시재 있고 오늘 오픈 전. API 실패(never_opened)로 영업 중 폴링을 끄지 않는다. */
export function shouldPauseMainPosIntervalPolling(opts: {
  loading: boolean
  businessOpenAllowed: boolean
  settlementClosed: boolean
  blockReason?: 'none' | 'never_opened' | 'new_business_day'
}): boolean {
  if (opts.loading) return false
  if (opts.settlementClosed) return true
  if (!opts.businessOpenAllowed && opts.blockReason === 'new_business_day') return true
  return false
}

/**
 * head 폴링 스케줄.
 * - healthy + recent: fetch=false (API 없음)
 * - healthy + stale: fetch=true, 45s (누락 안전망)
 * - degraded: fetch=true, 15s
 */
export function resolveMainPosHeadPollSchedule(opts: {
  realtimeChannelHealthy: boolean
  realtimeRecentlyActive?: boolean
}): { delayMs: number; fetch: boolean } {
  if (!opts.realtimeChannelHealthy) {
    return { delayMs: MAIN_POS_HEAD_POLL_INTERVAL_DEGRADED_MS, fetch: true }
  }
  if (opts.realtimeRecentlyActive) {
    return { delayMs: MAIN_POS_HEAD_POLL_HEALTHY_RECHECK_MS, fetch: false }
  }
  return { delayMs: MAIN_POS_HEAD_POLL_INTERVAL_HEALTHY_SPARSE_MS, fetch: true }
}

/** @deprecated use resolveMainPosHeadPollSchedule — active healthy 시 null(미호출) */
export function resolveMainPosHeadPollIntervalMs(opts: {
  realtimeChannelHealthy: boolean
  realtimeRecentlyActive?: boolean
}): number | null {
  const s = resolveMainPosHeadPollSchedule(opts)
  return s.fetch ? s.delayMs : null
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
