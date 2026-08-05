import { attendanceStoreNamePostgrestVariantsFilter } from '@/lib/attendance-utils'
import { addBangkokCalendarDays, getBangkokDateRangeUtc, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

/** 사이드바·허브 배지 — 최근 N일(방콕, 오늘 포함). 인사 휴가 배지와 동일 기간 */
export const STORE_OPS_BADGE_LOOKBACK_DAYS = 30

/** A/S 「접수」가 이 일수 이상이면 지연(배지) */
export const STORE_OPS_REPAIR_STALE_DAYS = 3

/** PostgREST store_name — 허용 매장(OR) 필터. 빈 배열이면 필터 없음(본사 전체). */
export function storeOpsStoreNameScopePostgrestFilter(allowedStores: string[]): string {
  const stores = [...new Set(allowedStores.map((s) => String(s || '').trim()).filter(Boolean))]
  if (stores.length === 0) return ''
  const inner: string[] = []
  for (const store of stores) {
    const f = attendanceStoreNamePostgrestVariantsFilter(store)
    if (!f) continue
    if (f.startsWith('or=(')) {
      inner.push(f.slice(4, -1))
    } else {
      inner.push(f)
    }
  }
  if (inner.length === 0) return ''
  if (inner.length === 1) return inner[0]
  return `or=(${inner.join(',')})`
}

export function storeOpsStoreInScope(
  storeName: string,
  allowedStores: string[],
  officeScope: boolean
): boolean {
  if (officeScope) return true
  const sn = String(storeName || '').trim()
  if (!sn) return false
  return allowedStores.some((a) => storesMatchForGradeLookup(a, sn))
}

export function storeOpsIsStoreCheckedToday(
  operationalStore: string,
  checkedStoreNames: Iterable<string>
): boolean {
  const target = String(operationalStore || '').trim()
  if (!target) return false
  for (const checked of checkedStoreNames) {
    if (storesMatchForGradeLookup(checked, target)) return true
  }
  return false
}

export function appendStoreOpsScopeFilter(baseFilter: string, scopeFilter: string): string {
  const scope = String(scopeFilter || '').trim()
  if (!scope) return baseFilter
  return `${baseFilter}&${scope}`
}

/**
 * A/S 배지 — 아직 아무도 손대지 않은「접수」만.
 * 진행중·보류 제외. 최근 N일 신고분 중 staleDays일 이상 미착수.
 */
export function storeOpsStaleRepairBadgePostgrestFilter(options?: {
  todayYmd?: string
  lookbackDays?: number
  staleDays?: number
}): string {
  const today = String(options?.todayYmd || getBangkokTodayDateString()).trim()
  const lookback = Math.max(1, options?.lookbackDays ?? STORE_OPS_BADGE_LOOKBACK_DAYS)
  const staleDays = Math.max(1, options?.staleDays ?? STORE_OPS_REPAIR_STALE_DAYS)
  const lookbackStart = addBangkokCalendarDays(today, -(lookback - 1))
  const staleCutoff = addBangkokCalendarDays(today, -staleDays)
  const { dayStartUtcIso: lookbackStartIso } = getBangkokDateRangeUtc(lookbackStart, lookbackStart)
  const { nextDayStartUtcIso: staleExclusive } = getBangkokDateRangeUtc(staleCutoff, staleCutoff)
  return [
    `status=eq.${encodeURIComponent('접수')}`,
    `reported_at=gte.${encodeURIComponent(lookbackStartIso)}`,
    `reported_at=lt.${encodeURIComponent(staleExclusive)}`,
  ].join('&')
}

/**
 * 컴플레인 배지 — 「접수」만 (조사중·보류는 이미 착수/보류 → 제외).
 * 최근 N일(log_date)만.
 */
export function storeOpsOpenComplaintBadgePostgrestFilter(options?: {
  todayYmd?: string
  lookbackDays?: number
}): string {
  const today = String(options?.todayYmd || getBangkokTodayDateString()).trim()
  const lookback = Math.max(1, options?.lookbackDays ?? STORE_OPS_BADGE_LOOKBACK_DAYS)
  const startYmd = addBangkokCalendarDays(today, -(lookback - 1))
  return `log_date=gte.${encodeURIComponent(startYmd)}&status=eq.${encodeURIComponent('접수')}`
}
