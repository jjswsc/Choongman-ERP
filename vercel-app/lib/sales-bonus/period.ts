import { lastDayOfMonthYmd, ymdForDayOfMonth } from '@/lib/payroll-cycle'
import { shiftYearMonth } from '@/lib/payroll-utils'

export type SalesBonusResolvedPeriod = {
  /** 매출 집계 월 YYYY-MM (달력월) */
  month: string
  start: string
  end: string
  /** 익월 payoutDay */
  payYmd: string
  payoutDay: number
}

/** 지급일 1~28. 잘못되면 5. */
export function normalizeSalesBonusPayoutDay(raw: unknown, fallback = 5): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(28, n)
}

/**
 * 매출 보너스 기간 = 달력월 전체(1일~말일).
 * 지급일 = 익월 payoutDay (말일보다 크면 말일).
 * 급여 주기(26~25)와 분리 — 말일까지 매출을 반영하려면 익월 1·5일에 확정.
 */
export function resolveSalesBonusCalendarPeriod(
  salesMonth: string,
  payoutDayRaw?: unknown
): SalesBonusResolvedPeriod {
  const month = String(salesMonth || '').trim().slice(0, 7)
  const payoutDay = normalizeSalesBonusPayoutDay(payoutDayRaw, 5)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { month: '', start: '', end: '', payYmd: '', payoutDay }
  }
  const start = `${month}-01`
  const end = lastDayOfMonthYmd(month)
  const next = shiftYearMonth(month, 1)
  const payYmd = next ? ymdForDayOfMonth(next, payoutDay) : ''
  return { month, start, end, payYmd, payoutDay }
}

const YM_RE = /^\d{4}-\d{2}$/

/** from~to 포함 달력월 목록. 잘못된 값·역전·한도 초과 시 빈 배열. */
export function listYearMonthsInclusive(
  fromYm: string,
  toYm: string,
  maxMonths = 24
): string[] {
  const from = String(fromYm || '').trim().slice(0, 7)
  const to = String(toYm || '').trim().slice(0, 7)
  if (!YM_RE.test(from) || !YM_RE.test(to) || from > to) return []
  const out: string[] = []
  let cur: string | null = from
  while (cur && cur <= to) {
    out.push(cur)
    if (out.length > maxMonths) return []
    cur = shiftYearMonth(cur, 1)
  }
  return out
}
