import {
  addBangkokCalendarDays,
  getBangkokMonthRange,
  getBangkokMonthRangeWithOffset,
  getBangkokStartOfDayUtcIso,
  getBangkokTodayDateString,
} from '@/lib/bangkok-time'

export const CRM_RECENT_DAYS_MIN = 7
export const CRM_RECENT_DAYS_MAX = 365
export const CRM_DORMANT_DAYS_MIN = 14
export const CRM_DORMANT_DAYS_MAX = 720
export const CRM_RECENT_DAYS_DEFAULT = 30
export const CRM_DORMANT_DAYS_DEFAULT = 90

/** 단일 라벨 프리셋: 최근활동 창을 기준으로 잡고, 휴면은 내부에서 짝을 맞춤 */
export const CRM_DATE_PRESET_IDS = ['d7', 'd30', 'thisMonth', 'lastMonth'] as const
export type CrmDatePresetId = (typeof CRM_DATE_PRESET_IDS)[number]

export const CRM_DATE_PRESET_I18N_KEYS: Record<CrmDatePresetId, string> = {
  d7: 'crmDashPreset7',
  d30: 'crmDashPreset30',
  thisMonth: 'crmDashPresetThisMonth',
  lastMonth: 'crmDashPresetLastMonth',
}

export type CrmCutoffResolved = { days: number; date: string }

export function clampCrmRecentDays(n: number): number {
  const v = Number.isFinite(n) ? Math.round(n) : CRM_RECENT_DAYS_DEFAULT
  return Math.max(CRM_RECENT_DAYS_MIN, Math.min(CRM_RECENT_DAYS_MAX, v))
}

export function clampCrmDormantDays(n: number): number {
  const v = Number.isFinite(n) ? Math.round(n) : CRM_DORMANT_DAYS_DEFAULT
  return Math.max(CRM_DORMANT_DAYS_MIN, Math.min(CRM_DORMANT_DAYS_MAX, v))
}

/** 방콕 오늘에서 `days`일 전 달력일 (YYYY-MM-DD). 최근활동·휴면 컷오프. */
export function crmCutoffDateFromDays(days: number, today = getBangkokTodayDateString()): string {
  return addBangkokCalendarDays(today, -Math.round(days))
}

/** `ymd`부터 방콕 `today`까지 지난 일수. 잘못된 날짜는 NaN. */
export function crmDaysFromCutoffDate(ymd: string, today = getBangkokTodayDateString()): number {
  const raw = String(ymd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return NaN
  const start = Date.parse(getBangkokStartOfDayUtcIso(raw))
  const end = Date.parse(getBangkokStartOfDayUtcIso(today))
  if (Number.isNaN(start) || Number.isNaN(end)) return NaN
  return Math.round((end - start) / 86400000)
}

export function resolveCrmRecentCutoff(
  ymd: string,
  today = getBangkokTodayDateString()
): CrmCutoffResolved {
  const days = clampCrmRecentDays(crmDaysFromCutoffDate(ymd, today))
  return { days, date: crmCutoffDateFromDays(days, today) }
}

export function resolveCrmDormantCutoff(
  ymd: string,
  today = getBangkokTodayDateString()
): CrmCutoffResolved {
  const days = clampCrmDormantDays(crmDaysFromCutoffDate(ymd, today))
  return { days, date: crmCutoffDateFromDays(days, today) }
}

export function crmRecentDateBounds(today = getBangkokTodayDateString()): { min: string; max: string } {
  return {
    min: crmCutoffDateFromDays(CRM_RECENT_DAYS_MAX, today),
    max: crmCutoffDateFromDays(CRM_RECENT_DAYS_MIN, today),
  }
}

export function crmDormantDateBounds(today = getBangkokTodayDateString()): { min: string; max: string } {
  return {
    min: crmCutoffDateFromDays(CRM_DORMANT_DAYS_MAX, today),
    max: crmCutoffDateFromDays(CRM_DORMANT_DAYS_MIN, today),
  }
}

/**
 * 최근활동 컷오프가 휴면 컷오프보다 이후(더 최근)여야 이탈위험 구간이 성립한다.
 * YYYY-MM-DD 문자열 비교로 충분하다.
 */
export function isCrmCutoffOrderValid(recentDate: string, dormantDate: string): boolean {
  const recent = String(recentDate || '').trim()
  const dormant = String(dormantDate || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recent) || !/^\d{4}-\d{2}-\d{2}$/.test(dormant)) return false
  return recent > dormant
}

function bangkokBaseFromToday(today: string): Date {
  return new Date(`${today}T12:00:00+07:00`)
}

function pairWithDefaultDormant(
  recent: CrmCutoffResolved,
  today: string
): { recent: CrmCutoffResolved; dormant: CrmCutoffResolved } {
  const dormant = {
    days: CRM_DORMANT_DAYS_DEFAULT,
    date: crmCutoffDateFromDays(CRM_DORMANT_DAYS_DEFAULT, today),
  }
  if (isCrmCutoffOrderValid(recent.date, dormant.date)) {
    return { recent, dormant }
  }
  const fallbackDays = clampCrmDormantDays(recent.days + 60)
  return {
    recent,
    dormant: {
      days: fallbackDays,
      date: crmCutoffDateFromDays(fallbackDays, today),
    },
  }
}

export function applyCrmDatePreset(
  id: CrmDatePresetId,
  today = getBangkokTodayDateString()
): { recent: CrmCutoffResolved; dormant: CrmCutoffResolved } {
  const base = bangkokBaseFromToday(today)

  if (id === 'thisMonth') {
    const monthStart = getBangkokMonthRange(undefined, base).startStr
    return pairWithDefaultDormant(resolveCrmRecentCutoff(monthStart, today), today)
  }

  if (id === 'lastMonth') {
    const lastStart = getBangkokMonthRangeWithOffset(-1, base).start
    const prevStart = getBangkokMonthRangeWithOffset(-2, base).start
    const recent = resolveCrmRecentCutoff(lastStart, today)
    const dormant = resolveCrmDormantCutoff(prevStart, today)
    if (isCrmCutoffOrderValid(recent.date, dormant.date)) {
      return { recent, dormant }
    }
    return pairWithDefaultDormant(recent, today)
  }

  const pairs: Record<Exclude<CrmDatePresetId, 'thisMonth' | 'lastMonth'>, { recent: number; dormant: number }> = {
    d7: { recent: 7, dormant: 30 },
    d30: { recent: CRM_RECENT_DAYS_DEFAULT, dormant: CRM_DORMANT_DAYS_DEFAULT },
  }
  const pair = pairs[id]
  return {
    recent: {
      days: clampCrmRecentDays(pair.recent),
      date: crmCutoffDateFromDays(clampCrmRecentDays(pair.recent), today),
    },
    dormant: {
      days: clampCrmDormantDays(pair.dormant),
      date: crmCutoffDateFromDays(clampCrmDormantDays(pair.dormant), today),
    },
  }
}

/** 현재 컷오프 일수가 프리셋과 일치하면 그 id, 아니면 null. */
export function matchCrmDatePreset(
  recentDays: number,
  dormantDays: number,
  today = getBangkokTodayDateString()
): CrmDatePresetId | null {
  for (const id of CRM_DATE_PRESET_IDS) {
    const applied = applyCrmDatePreset(id, today)
    if (applied.recent.days === recentDays && applied.dormant.days === dormantDays) return id
  }
  return null
}
