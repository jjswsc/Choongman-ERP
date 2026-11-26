import {
  EMPTY_PAYROLL_CYCLE_SETTINGS,
  lastDayOfMonthYmd,
  resolvePayrollPeriod,
  ymdForDayOfMonth,
  type PayrollCycleSettings,
} from '@/lib/payroll-cycle'
import { shiftYearMonth } from '@/lib/payroll-utils'

/** 0 = 급여 주기의 지급일(익월 급여일)에 맞춤 */
export const SALES_BONUS_PAYOUT_FOLLOW_PAYROLL = 0

export type SalesBonusResolvedPeriod = {
  /** 매출 집계 월 YYYY-MM (달력월) */
  month: string
  start: string
  end: string
  /** 지급 예정일 YYYY-MM-DD */
  payYmd: string
  /** 0 = 급여일 연동, 1~28 = 익월 고정일 */
  payoutDay: number
}

/**
 * 지급일 정규화. 0 = 익월 급여일 연동, 1~28 = 익월 고정일.
 * 잘못되면 fallback(기본 0).
 */
export function normalizeSalesBonusPayoutDay(
  raw: unknown,
  fallback: number = SALES_BONUS_PAYOUT_FOLLOW_PAYROLL
): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 0) {
    return normalizeSalesBonusPayoutDay(fallback, SALES_BONUS_PAYOUT_FOLLOW_PAYROLL)
  }
  if (n === 0) return SALES_BONUS_PAYOUT_FOLLOW_PAYROLL
  return Math.min(28, n)
}

/**
 * 매출 보너스 기간 = 달력월 전체(1일~말일).
 * payoutDay 0 → 급여 주기 설정상의 지급일(익월 급여일).
 * payoutDay 1~28 → 익월 해당일(말일보다 크면 말일).
 */
export function resolveSalesBonusCalendarPeriod(
  salesMonth: string,
  payoutDayRaw?: unknown,
  payrollCycle: PayrollCycleSettings = EMPTY_PAYROLL_CYCLE_SETTINGS
): SalesBonusResolvedPeriod {
  const month = String(salesMonth || '').trim().slice(0, 7)
  const payoutDay = normalizeSalesBonusPayoutDay(payoutDayRaw)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { month: '', start: '', end: '', payYmd: '', payoutDay }
  }
  const start = `${month}-01`
  const end = lastDayOfMonthYmd(month)
  if (payoutDay === SALES_BONUS_PAYOUT_FOLLOW_PAYROLL) {
    const payYmd = resolvePayrollPeriod(month, payrollCycle).payYmd
    return { month, start, end, payYmd, payoutDay }
  }
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
