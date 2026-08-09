/**
 * 매출 기간 집계 — 영업일 요일(0=일 … 6=토, getDayOfWeekBangkok) 필터.
 * 쿼리 `dows=5,6` → 금·토만. 없거나 비면 필터 없음(전체).
 */

export const POS_SALES_DOW_VALUES = [0, 1, 2, 3, 4, 5, 6] as const
export type PosSalesDowValue = (typeof POS_SALES_DOW_VALUES)[number]

const ALLOWED = new Set<number>(POS_SALES_DOW_VALUES)

/** UI 토글 순서: 월→일 (태국/한국 주 시작에 맞춤) */
export const POS_SALES_DOW_TOGGLE_ORDER: PosSalesDowValue[] = [1, 2, 3, 4, 5, 6, 0]

export const POS_SALES_DOW_LABEL_KEYS: Record<PosSalesDowValue, string> = {
  0: "salesWeekdaySun",
  1: "salesWeekdayMon",
  2: "salesWeekdayTue",
  3: "salesWeekdayWed",
  4: "salesWeekdayThu",
  5: "salesWeekdayFri",
  6: "salesWeekdaySat",
}

/**
 * 쿼리 `dows=0,5,6` 파싱.
 * 없거나 비어 있거나 7개 모두면 필터 없음(전체).
 */
export function parseDowsParam(raw: string | null | undefined): PosSalesDowValue[] | null {
  if (raw == null || !String(raw).trim()) return null
  const out: PosSalesDowValue[] = []
  const seen = new Set<number>()
  for (const p of String(raw).split(",")) {
    const n = Number(p.trim())
    if (!Number.isInteger(n) || !ALLOWED.has(n) || seen.has(n)) continue
    seen.add(n)
    out.push(n as PosSalesDowValue)
  }
  if (out.length === 0 || out.length === POS_SALES_DOW_VALUES.length) return null
  return out.sort((a, b) => a - b)
}

/** URL·state용: 빈 문자열 = 필터 없음(전체) */
export function normalizeDowsQueryString(raw: string | null | undefined): string {
  const p = parseDowsParam(raw)
  if (!p?.length) return ""
  return p.join(",")
}

export function rowMatchesDowFilter(
  businessYmd: string,
  allowed: PosSalesDowValue[] | null,
  getDow: (ymd: string) => number
): boolean {
  if (allowed == null) return true
  return allowed.includes(getDow(businessYmd) as PosSalesDowValue)
}
