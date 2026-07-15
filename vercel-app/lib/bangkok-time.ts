const BANGKOK_TIMEZONE = 'Asia/Bangkok'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 방콕(UTC+7) 기준 "YYYY-MM-DD HH:mm:ss" 문자열
 * timestamp without time zone 컬럼 저장용으로 사용.
 */
export function getBangkokDateTimeString(base: Date = new Date()): string {
  const local = new Date(base.toLocaleString('en-US', { timeZone: BANGKOK_TIMEZONE }))
  const y = local.getFullYear()
  const m = pad2(local.getMonth() + 1)
  const d = pad2(local.getDate())
  const hh = pad2(local.getHours())
  const mm = pad2(local.getMinutes())
  const ss = pad2(local.getSeconds())
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

/** `YYYY-MM-DD HH:mm:ss`·ISO(+07:00) 등 혼재 입력을 문자열 비교용 키로 통일 */
export function normalizeBangkokDateTimeCompareKey(raw: string | null | undefined): string {
  const v = String(raw || '').trim()
  if (!v) return ''
  const withTime = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/)
  if (withTime) return `${withTime[1]} ${withTime[2]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v} 00:00:00`
  return v
}

export function isBangkokDateTimeBefore(a: string, b: string): boolean {
  const ka = normalizeBangkokDateTimeCompareKey(a)
  const kb = normalizeBangkokDateTimeCompareKey(b)
  if (!ka || !kb) return false
  return ka < kb
}

export function isBangkokDateTimeAfter(a: string, b: string): boolean {
  return isBangkokDateTimeBefore(b, a)
}

/** Kbank API `requestDt` — 방콕 벽시계 `YYYY-MM-DDTHH:mm:ss+07:00` */
export function getBangkokRequestDtIso(base: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(base)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+07:00`
}

/** 방콕 기준 오늘 날짜 (YYYY-MM-DD) */
export function getBangkokTodayDateString(base: Date = new Date()): string {
  return base.toLocaleDateString('en-CA', { timeZone: BANGKOK_TIMEZONE })
}

/** 방콕 기준 ISO 주(월요일~일요일). `offsetWeeks` 0=이번 주, -1=지난 주 */
export function getBangkokWeekRange(offsetWeeks = 0, base: Date = new Date()): {
  start: string
  end: string
  label: string
} {
  const today = getBangkokTodayDateString(base)
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: BANGKOK_TIMEZONE,
    weekday: 'short',
  }).format(base)
  const dayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 0,
  }
  const dow = dayMap[weekday] ?? 1
  const daysSinceMonday = dow === 0 ? 6 : dow - 1
  const monday = addBangkokCalendarDays(today, -daysSinceMonday + offsetWeeks * 7)
  const sunday = addBangkokCalendarDays(monday, 6)
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split('-')
    return `${y}.${m}.${d}`
  }
  return { start: monday, end: sunday, label: `${fmt(monday)} ~ ${fmt(sunday)}` }
}

/** 방콕 기준 월 범위 + `offsetMonths` (0=이번 달) */
export function getBangkokMonthRangeWithOffset(offsetMonths = 0, base: Date = new Date()): {
  start: string
  end: string
  label: string
  yearMonth: string
} {
  const today = getBangkokTodayDateString(base)
  let y = Number(today.slice(0, 4))
  let m = Number(today.slice(5, 7))
  m += offsetMonths
  while (m > 12) {
    m -= 12
    y += 1
  }
  while (m < 1) {
    m += 12
    y -= 1
  }
  const yearMonth = `${y}-${pad2(m)}`
  const baseRange = getBangkokMonthRange(yearMonth, base)
  const lastDay = Number(baseRange.endStr.slice(8, 10))
  return {
    start: baseRange.startStr,
    end: baseRange.endStr,
    yearMonth,
    label: `${y}.${pad2(m)} (1 ~ ${lastDay}일)`,
  }
}

/** 방콕 기준 해당 월의 시작/종료 날짜 (YYYY-MM-DD) */
export function getBangkokMonthRange(yearMonth?: string, base: Date = new Date()): {
  yearMonth: string
  startStr: string
  endStr: string
} {
  if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
    const [y, m] = yearMonth.split('-').map(Number)
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return {
      yearMonth,
      startStr: `${y}-${String(m).padStart(2, '0')}-01`,
      endStr: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    }
  }

  const today = getBangkokTodayDateString(base)
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))
  const ym = `${y}-${String(m).padStart(2, '0')}`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return {
    yearMonth: ym,
    startStr: `${y}-${String(m).padStart(2, '0')}-01`,
    endStr: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  return {
    y: Number(ymd.slice(0, 4)),
    m: Number(ymd.slice(5, 7)),
    d: Number(ymd.slice(8, 10)),
  }
}

/** 방콕 달력 `ymd`에서 `deltaDays`일 후의 YYYY-MM-DD (음수 가능). DST 없음 가정으로 일 단위 가산. */
export function addBangkokCalendarDays(ymd: string, deltaDays: number): string {
  const startMs = Date.parse(getBangkokStartOfDayUtcIso(ymd))
  if (Number.isNaN(startMs)) {
    throw new Error(`addBangkokCalendarDays: invalid date ${ymd}`)
  }
  const ms = startMs + deltaDays * 86400000
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: BANGKOK_TIMEZONE })
}

/** 방콕 달력 `ymd`에서 `deltaYears`년 후의 YYYY-MM-DD (음수 가능). 2/29 → 비윤년은 2/28로 클램프. */
export function addBangkokCalendarYears(ymd: string, deltaYears: number): string {
  const { y, m, d } = parseYmd(ymd)
  const targetY = y + deltaYears
  const lastDay = new Date(Date.UTC(targetY, m, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return `${targetY}-${pad2(m)}-${pad2(day)}`
}

/** 방콕 자정 기준 UTC ISO */
export function getBangkokStartOfDayUtcIso(ymd: string): string {
  const { y, m, d } = parseYmd(ymd)
  return new Date(Date.UTC(y, m - 1, d, -7, 0, 0, 0)).toISOString()
}

/** `HH:mm` 또는 `H:mm` → `HH:mm` (방콕 벽시계). 잘못된 값은 null */
export function parseBangkokHhmm(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null
  }
  return `${pad2(hh)}:${pad2(mm)}`
}

/** 방콕 달력 `ymd` + `HH:mm` → UTC ISO */
export function getBangkokLocalTimeUtcIso(ymd: string, hhmm: string): string {
  const norm = parseBangkokHhmm(hhmm)
  if (!norm) {
    throw new Error(`getBangkokLocalTimeUtcIso: invalid time ${hhmm}`)
  }
  const { y, m, d } = parseYmd(ymd)
  const [hh, mm] = norm.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hh - 7, mm, 0, 0)).toISOString()
}

/** 방콕 다음날 자정 기준 UTC ISO (반열린 구간 end 전용) */
export function getBangkokNextDayStartUtcIso(ymd: string): string {
  const { y, m, d } = parseYmd(ymd)
  return new Date(Date.UTC(y, m - 1, d + 1, -7, 0, 0, 0)).toISOString()
}

/**
 * 방콕 달력 `YYYY-MM-DD` 하루의 마지막 순간(다음날 0시 직전)을 UTC ISO로.
 * `log_date <= 이 값` 이면 해당 방콕일까지의 재고에 포함(UTC 자정만 보는 실수 방지).
 */
export function getBangkokEndOfDayUtcIso(ymd: string): string {
  const nextStartMs = Date.parse(getBangkokNextDayStartUtcIso(ymd))
  if (Number.isNaN(nextStartMs)) {
    throw new Error(`getBangkokEndOfDayUtcIso: invalid date ${ymd}`)
  }
  return new Date(nextStartMs - 1).toISOString()
}

/** 방콕 날짜 범위를 UTC 반열린 구간으로 변환 [start, nextDayStart) */
export function getBangkokDateRangeUtc(startYmd: string, endYmd: string): {
  dayStartUtcIso: string
  nextDayStartUtcIso: string
} {
  return {
    dayStartUtcIso: getBangkokStartOfDayUtcIso(startYmd),
    nextDayStartUtcIso: getBangkokNextDayStartUtcIso(endYmd),
  }
}

/**
 * 방콕 기준 최근 `count`개월(이번 달 포함) `YYYY-MM` 목록.
 * `Date#setMonth` 말일 보정으로 같은 달이 두 번 나오는 문제를 피하기 위해 연·월 정수로만 감소합니다.
 */
export function getBangkokRecentYearMonths(count: number, base: Date = new Date()): string[] {
  const { yearMonth } = getBangkokMonthRange(undefined, base)
  let y = Number(yearMonth.slice(0, 4))
  let m = Number(yearMonth.slice(5, 7))
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
  }
  return out
}

/** `YYYY-MM` 파싱 (방콕 달력 월) */
export function parseBangkokYearMonth(ym: string): { y: number; m: number } | null {
  const s = String(ym ?? '').trim()
  if (!/^\d{4}-\d{2}$/.test(s)) return null
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(5, 7))
  if (!Number.isFinite(y) || m < 1 || m > 12) return null
  return { y, m }
}

/**
 * 시작월~종료월(포함) 모든 `YYYY-MM`. 순서가 뒤바뀌면 자동 교환.
 * 잘못된 형식이면 빈 배열.
 */
export function expandBangkokYearMonthsInclusive(startYm: string, endYm: string): string[] {
  const a = parseBangkokYearMonth(startYm)
  const b = parseBangkokYearMonth(endYm)
  if (!a || !b) return []
  let y = a.y
  let m = a.m
  let endY = b.y
  let endM = b.m
  if (y > endY || (y === endY && m > endM)) {
    y = b.y
    m = b.m
    endY = a.y
    endM = a.m
  }
  const out: string[] = []
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/** `ym`에서 `deltaMonths`만큼 이동한 `YYYY-MM` (음수=과거) */
export function shiftBangkokYearMonth(ym: string, deltaMonths: number): string | null {
  const p = parseBangkokYearMonth(ym)
  if (!p) return null
  let y = p.y
  let m = p.m + deltaMonths
  while (m < 1) {
    m += 12
    y -= 1
  }
  while (m > 12) {
    m -= 12
    y += 1
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

/** 동일 개월 수의 직전 기간 (전월·전분기 MoM/MoQ용) */
export function priorBangkokPeriodMonths(
  startYm: string,
  endYm: string
): { startYm: string; endYm: string; monthCount: number } | null {
  const months = expandBangkokYearMonthsInclusive(startYm, endYm)
  if (months.length === 0) return null
  const priorEnd = shiftBangkokYearMonth(months[0], -1)
  if (!priorEnd) return null
  const priorStart = shiftBangkokYearMonth(months[0], -months.length)
  if (!priorStart) return null
  return { startYm: priorStart, endYm: priorEnd, monthCount: months.length }
}
