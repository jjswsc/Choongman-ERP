/** 방콕(Asia/Bangkok) 달력 날짜 — 모바일 공지 기간·당일 등 */
import {
  addBangkokCalendarDays,
  getBangkokDateRangeUtc,
  getBangkokEndOfDayUtcIso,
  getBangkokStartOfDayUtcIso,
} from "./bangkok-time"

const TZ = "Asia/Bangkok"

export function bangkokTodayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ })
}

/** @alias bangkokTodayYmd */
export const todayBangkokYmd = bangkokTodayYmd

/** @alias bangkokTodayYmd */
export const bangkokDateYmd = bangkokTodayYmd

/** 방콕 기준 오늘 날짜 `YYYY-MM-DD` (POS 프로모·표시용) */
export const bangkokDateStrISO = bangkokTodayYmd

/**
 * `endYmd`를 포함해 총 `days`일(포함) 구간의 시작·끝 YYYY-MM-DD.
 * 예: days=30이면 end에서 29일 전 ~ end.
 */
export function bangkokInclusivePeriod(endYmd: string, days: number): { startYmd: string; endYmd: string } {
  const d = Math.max(1, Math.floor(Number(days) || 1))
  const end = String(endYmd || "").trim()
  const startYmd = addBangkokCalendarDays(end, -(d - 1))
  return { startYmd, endYmd: end }
}

/** stock_logs 등 타임스탬프 범위: 시작일 0시 ~ 종료일 말(포함) */
export function bangkokYmdRangeToIsoBounds(startYmd: string, endYmd: string): { gteIso: string; lteIso: string } {
  const a = String(startYmd || "").trim()
  const b = String(endYmd || "").trim()
  return {
    gteIso: getBangkokStartOfDayUtcIso(a),
    lteIso: getBangkokEndOfDayUtcIso(b),
  }
}

/** 방콕 달력 start~end(포함) — stock_logs.log_date PostgREST 반열린 구간 [gte, lt) */
export function stockLogBangkokDateRangeFilter(startYmd: string, endYmd: string): {
  lo: string
  hi: string
  gtePart: string
  ltPart: string
} {
  const a = String(startYmd || "").trim().slice(0, 10)
  const b = String(endYmd || "").trim().slice(0, 10)
  const lo = a <= b ? a : b
  const hi = a <= b ? b : a
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(lo, hi)
  return {
    lo,
    hi,
    gtePart: `log_date=gte.${encodeURIComponent(dayStartUtcIso)}`,
    ltPart: `log_date=lt.${encodeURIComponent(nextDayStartUtcIso)}`,
  }
}

/** 오늘 방콕 달력 기준 `monthsAgo`개월 전 달의 1일 YYYY-MM-DD */
export function bangkokFirstOfMonthMonthsAgo(monthsAgo: number, base: Date = new Date()): string {
  const n = Math.max(0, Math.floor(Number(monthsAgo) || 0))
  const today = base.toLocaleDateString("en-CA", { timeZone: TZ })
  let y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))
  let mm = m - n
  while (mm < 1) {
    mm += 12
    y -= 1
  }
  return `${y}-${String(mm).padStart(2, "0")}-01`
}
