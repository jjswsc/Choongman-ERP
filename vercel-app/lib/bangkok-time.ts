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

/** 방콕 자정 기준 UTC ISO */
export function getBangkokStartOfDayUtcIso(ymd: string): string {
  const { y, m, d } = parseYmd(ymd)
  return new Date(Date.UTC(y, m - 1, d, -7, 0, 0, 0)).toISOString()
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
