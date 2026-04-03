/** 직원 평가·근태 등 UI 기본 기간용 — 방콕 달력 YYYY-MM-DD */
const TZ = 'Asia/Bangkok'

export function bangkokDateYmd(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** 오늘 날짜 YYYY-MM-DD (방콕) */
export function todayBangkokYmd(): string {
  return bangkokDateYmd(new Date())
}

/**
 * POS·프로모 등: 기본값으로 쓰는 방콕 영업일 문자열 (YYYY-MM-DD).
 * 인자 없으면 현재 시각 기준 방콕 달력.
 */
export function bangkokDateStrISO(d: Date = new Date()): string {
  return bangkokDateYmd(d)
}

/** YYYY-MM-DD를 방콕 자정(+07:00) 기준으로 일 수만큼 이동 */
function bangkokYmdAddDays(ymd: string, deltaDays: number): string {
  const s = String(ymd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return todayBangkokYmd()
  const t = new Date(`${s}T12:00:00+07:00`).getTime() + deltaDays * 86400000
  return new Date(t).toLocaleDateString('en-CA', { timeZone: TZ })
}

/**
 * `endYmd`를 끝으로 하는 달력일 `days`일 구간(양끝 포함).
 * 예: days=30, end=2025-01-30 → start=2025-01-01
 */
export function bangkokInclusivePeriod(
  endYmd: string,
  days: number
): { startYmd: string; endYmd: string } {
  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(endYmd).trim()) ? String(endYmd).trim() : todayBangkokYmd()
  const n = Math.max(1, Math.floor(Number(days) || 1))
  const startYmd = bangkokYmdAddDays(end, -(n - 1))
  return { startYmd, endYmd: end }
}

/**
 * 방콕 달력 일자 구간을 DB timestamp 비교용 ISO 문자열로 (해당 일 00:00~23:59:59.999 방콕).
 */
export function bangkokYmdRangeToIsoBounds(
  startYmd: string,
  endYmd: string
): { gteIso: string; lteIso: string } {
  const a = /^\d{4}-\d{2}-\d{2}$/.test(String(startYmd).trim()) ? String(startYmd).trim() : todayBangkokYmd()
  const b = /^\d{4}-\d{2}-\d{2}$/.test(String(endYmd).trim()) ? String(endYmd).trim() : a
  const gteIso = new Date(`${a}T00:00:00+07:00`).toISOString()
  const lteIso = new Date(`${b}T23:59:59.999+07:00`).toISOString()
  return { gteIso, lteIso }
}

/** 방콕 달력 기준, 현재 월에서 monthsAgo 만큼 이전 달의 1일 (0 = 이번 달 1일) */
export function bangkokFirstOfMonthMonthsAgo(monthsAgo: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const y = parseInt(parts.find((p) => p.type === 'year')!.value, 10)
  const m = parseInt(parts.find((p) => p.type === 'month')!.value, 10)
  let yy = y
  let mm = m - monthsAgo
  while (mm < 1) {
    mm += 12
    yy -= 1
  }
  return `${yy}-${String(mm).padStart(2, '0')}-01`
}
