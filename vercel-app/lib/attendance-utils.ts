/**
 * 근태 공통: 관리자 페이지 기준 방콕(Asia/Bangkok) 타임존
 */

export const ATTENDANCE_TZ = 'Asia/Bangkok'

/** 현재 시각을 방콕 기준 날짜 YYYY-MM-DD */
export function todayStrBangkok(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: ATTENDANCE_TZ })
}

/** log_at(UTC ISO) → 방콕 기준 날짜 YYYY-MM-DD (급여/근태 집계용) */
export function toDateStrBangkok(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: ATTENDANCE_TZ })
}

/** log_at(ISO) → 방콕 기준 시각의 시(hour) 0~23. 자정 넘김 퇴근 판별용 */
export function getBangkokHour(iso: string | Date | null | undefined): number {
  if (iso == null) return 12
  const d = new Date(iso)
  const str = d.toLocaleTimeString('en-US', { timeZone: ATTENDANCE_TZ, hour: '2-digit', hour12: false })
  return parseInt(str, 10) || 0
}

/** 방콕 기준 N일 전 날짜 YYYY-MM-DD */
export function daysAgoStrBangkok(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toLocaleDateString('en-CA', { timeZone: ATTENDANCE_TZ })
}

/** 방콕 기준 날짜 문자열(YYYY-MM-DD)을 해당일 00:00 방콕 ~ 다음날 00:00 방콕(미포함)의 UTC ISO 구간으로 변환 */
export function bangkokDateToUtcRange(bangkokDateStr: string): { startISO: string; endISOExclusive: string } {
  const s = bangkokDateStr.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const fallback = new Date().toISOString().slice(0, 10)
    return bangkokDateToUtcRange(fallback)
  }
  const [y, m, d] = s.split('-').map(Number)
  // 00:00 Bangkok = UTC - 7h
  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 7 * 60 * 60 * 1000
  const endUtcMs = Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0) - 7 * 60 * 60 * 1000
  return {
    startISO: new Date(startUtcMs).toISOString().slice(0, 23) + 'Z',
    endISOExclusive: new Date(endUtcMs).toISOString().slice(0, 23) + 'Z',
  }
}

/** 방콕 기준 startDate~endDate(포함) 구간을 DB log_at 필터용 UTC ISO 구간으로 변환 */
export function bangkokDateRangeToUtc(
  startDate: string,
  endDate: string
): { startISO: string; endISOExclusive: string } {
  const startStr = startDate.trim().slice(0, 10)
  const endStr = endDate.trim().slice(0, 10)
  if (!startStr || !endStr) {
    const t = todayStrBangkok()
    return bangkokDateToUtcRange(t)
  }
  const start = bangkokDateToUtcRange(startStr)
  const end = bangkokDateToUtcRange(endStr)
  return {
    startISO: start.startISO,
    endISOExclusive: end.endISOExclusive,
  }
}

/** 날짜 문자열(YYYY-MM-DD)에 N일 더한 날짜. 자정 넘김 조회 연장용 */
export function addDayBangkok(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** 날짜 문자열(YYYY-MM-DD)의 방콕 기준 요일. 0=일요일, 1=월요일, ..., 6=토요일 */
export function getDayOfWeekBangkok(dateStr: string): number {
  const s = dateStr.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 0
  const d = new Date(s + 'T12:00:00Z')
  const w = d.toLocaleDateString('en-US', { timeZone: ATTENDANCE_TZ, weekday: 'short' })
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[w] ?? 0
}

/** 해당 주의 방콕 기준 월요일 날짜 YYYY-MM-DD. dateStr 없으면 방콕 오늘 기준 */
export function getMondayOfWeekBangkok(dateStr?: string): string {
  const today = dateStr ? dateStr.trim().slice(0, 10) : todayStrBangkok()
  if (!today) return todayStrBangkok()
  const day = getDayOfWeekBangkok(today)
  const diff = day === 0 ? -6 : -(day - 1)
  const [y, m, d] = today.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d + diff)
  return new Date(utc).toISOString().slice(0, 10)
}

/** 날짜 문자열에 N일 더하기 (UTC 기준 달력 연산, 시간표용) */
export function addDaysSchedule(dateStr: string, delta: number): string {
  const s = dateStr.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return dateStr
  const [y, m, d] = s.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d + delta)
  return new Date(utc).toISOString().slice(0, 10)
}
