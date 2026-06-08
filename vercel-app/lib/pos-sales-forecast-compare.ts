import type { PeriodAggRow } from '@/lib/pos-sales-period-aggregate'
import { getDayOfWeekBangkok, iterBangkokYmdInclusive } from '@/lib/attendance-utils'
import { addBangkokCalendarDays } from '@/lib/bangkok-time'

export type SalesCompareMetrics = {
  orderCount: number
  total: number
  guestSum: number
  salesPerGuest: number
}

export type YoyMonthCompareRow = {
  month: number
  calendarDays: number
  prevYear: SalesCompareMetrics
  currYear: SalesCompareMetrics
  changePct: {
    total: number | null
    guest: number | null
    salesPerGuest: number | null
  }
}

export type MomDayCompareRow = {
  day: number
  dayLabel: string
  prevMonth: SalesCompareMetrics & { dow: number }
  currMonth: SalesCompareMetrics & { dow: number }
  changePct: {
    total: number | null
    guest: number | null
    salesPerGuest: number | null
  }
}

export type ForecastHorizon = 'week' | 'month' | 'year'

export type DowAverageMap = Record<number, number>

export type SalesForecastSummary = {
  horizon: ForecastHorizon
  rangeStart: string
  rangeEnd: string
  lookbackStart: string
  lookbackEnd: string
  actualToDate: number
  projectedRemaining: number
  expectedTotal: number
  completedDays: number
  remainingDays: number
  dowAverages: DowAverageMap
}

function emptyMetrics(): SalesCompareMetrics {
  return { orderCount: 0, total: 0, guestSum: 0, salesPerGuest: 0 }
}

function metricsFromPeriodRow(row?: PeriodAggRow | null): SalesCompareMetrics {
  if (!row) return emptyMetrics()
  const guest = Number(row.dineInGuestSum ?? 0) > 0 ? Number(row.dineInGuestSum) : Number(row.guestSum ?? 0)
  const total = Number(row.total ?? 0) || 0
  const orderCount = Number(row.count ?? 0) || 0
  return {
    orderCount,
    total,
    guestSum: guest,
    salesPerGuest: guest > 0 ? Math.round((total / guest) * 100) / 100 : 0,
  }
}

export function pctChange(curr: number, prev: number): number | null {
  if (!Number.isFinite(prev) || !Number.isFinite(curr)) return null
  if (prev === 0) return curr === 0 ? 0 : null
  return Math.round(((curr - prev) / prev) * 10000) / 100
}

export function calendarDaysInMonth(year: number, month: number): number {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return 0
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function yearRangeYmd(year: number): { startStr: string; endStr: string } {
  const y = Math.trunc(year)
  return { startStr: `${y}-01-01`, endStr: `${y}-12-31` }
}

export function monthRangeYmd(year: number, month: number): { startStr: string; endStr: string } {
  const y = Math.trunc(year)
  const m = Math.trunc(month)
  const last = calendarDaysInMonth(y, m)
  const mm = String(m).padStart(2, '0')
  return { startStr: `${y}-${mm}-01`, endStr: `${y}-${mm}-${String(last).padStart(2, '0')}` }
}

export function prevCalendarMonth(year: number, month: number): { year: number; month: number } {
  if (month <= 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

export function parseYearFromYmd(ymd: string): number {
  return Number(String(ymd || '').slice(0, 4)) || new Date().getFullYear()
}

export function parseYearMonthFromYmd(ymd: string): { year: number; month: number } {
  const s = String(ymd || '').slice(0, 10)
  return { year: Number(s.slice(0, 4)) || 0, month: Number(s.slice(5, 7)) || 0 }
}

function indexPeriodRowsByKey(rows: PeriodAggRow[]): Map<string, PeriodAggRow> {
  const map = new Map<string, PeriodAggRow>()
  for (const r of rows) {
    const k = String(r.key ?? '').trim()
    if (k) map.set(k, r)
  }
  return map
}

/** 연도별 월간 전년대비 (POS 전년대비표) */
export function buildYoyMonthCompareRows(params: {
  year: number
  prevYearRows: PeriodAggRow[]
  currYearRows: PeriodAggRow[]
}): YoyMonthCompareRow[] {
  const { year } = params
  const prevMap = indexPeriodRowsByKey(params.prevYearRows)
  const currMap = indexPeriodRowsByKey(params.currYearRows)
  const out: YoyMonthCompareRow[] = []
  for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    const prevKey = `${year - 1}-${String(month).padStart(2, '0')}`
    const prevYear = metricsFromPeriodRow(prevMap.get(prevKey))
    const currYear = metricsFromPeriodRow(currMap.get(key))
    out.push({
      month,
      calendarDays: calendarDaysInMonth(year, month),
      prevYear,
      currYear,
      changePct: {
        total: pctChange(currYear.total, prevYear.total),
        guest: pctChange(currYear.guestSum, prevYear.guestSum),
        salesPerGuest: pctChange(currYear.salesPerGuest, prevYear.salesPerGuest),
      },
    })
  }
  return out
}

/** 월별 일간 전월대비 — 동일 일자(1일↔1일) (POS 전월대비표) */
export function buildMomDayCompareRows(params: {
  year: number
  month: number
  prevMonthRows: PeriodAggRow[]
  currMonthRows: PeriodAggRow[]
}): MomDayCompareRow[] {
  const { year, month } = params
  const prev = prevCalendarMonth(year, month)
  const prevMap = indexPeriodRowsByKey(params.prevMonthRows)
  const currMap = indexPeriodRowsByKey(params.currMonthRows)
  const days = calendarDaysInMonth(year, month)
  const out: MomDayCompareRow[] = []
  for (let day = 1; day <= days; day++) {
    const dd = String(day).padStart(2, '0')
    const currKey = `${year}-${String(month).padStart(2, '0')}-${dd}`
    const prevKey = `${prev.year}-${String(prev.month).padStart(2, '0')}-${dd}`
    const prevDaysInMonth = calendarDaysInMonth(prev.year, prev.month)
    const prevMetrics =
      day <= prevDaysInMonth ? metricsFromPeriodRow(prevMap.get(prevKey)) : emptyMetrics()
    const currMetrics = metricsFromPeriodRow(currMap.get(currKey))
    out.push({
      day,
      dayLabel: dd,
      prevMonth: { ...prevMetrics, dow: getDayOfWeekBangkok(prevKey) },
      currMonth: { ...currMetrics, dow: getDayOfWeekBangkok(currKey) },
      changePct: {
        total: day <= prevDaysInMonth ? pctChange(currMetrics.total, prevMetrics.total) : null,
        guest: day <= prevDaysInMonth ? pctChange(currMetrics.guestSum, prevMetrics.guestSum) : null,
        salesPerGuest:
          day <= prevDaysInMonth
            ? pctChange(currMetrics.salesPerGuest, prevMetrics.salesPerGuest)
            : null,
      },
    })
  }
  return out
}

function indexDailyTotals(rows: PeriodAggRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) {
    const k = String(r.key ?? '').trim()
    if (k) map.set(k, Number(r.total ?? 0) || 0)
  }
  return map
}

/** 과거 일별 매출로 요일(0=일~6=토) 평균 산출 */
export function computeDowAverageMap(dailyRows: PeriodAggRow[]): DowAverageMap {
  const sums: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  for (const r of dailyRows) {
    const key = String(r.key ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
    const dow = getDayOfWeekBangkok(key)
    const total = Number(r.total ?? 0) || 0
    sums[dow] = (sums[dow] ?? 0) + total
    counts[dow] = (counts[dow] ?? 0) + 1
  }
  const out: DowAverageMap = {}
  const allTotals = Object.keys(counts)
    .map((k) => Number(k))
    .filter((dow) => counts[dow]! > 0)
    .map((dow) => sums[dow]! / counts[dow]!)
  const fallback =
    allTotals.length > 0 ? allTotals.reduce((a, b) => a + b, 0) / allTotals.length : 0
  for (let dow = 0; dow <= 6; dow++) {
    out[dow] =
      counts[dow]! > 0
        ? Math.round((sums[dow]! / counts[dow]!) * 100) / 100
        : Math.round(fallback * 100) / 100
  }
  return out
}

export function weekRangeContainingYmd(ymd: string): { startStr: string; endStr: string } {
  const s = String(ymd || '').slice(0, 10)
  const dow = getDayOfWeekBangkok(s)
  const toMonday = dow === 0 ? -6 : -(dow - 1)
  const startStr = addBangkokCalendarDays(s, toMonday)
  const endStr = addBangkokCalendarDays(startStr, 6)
  return { startStr, endStr }
}

export function yearRangeContainingYmd(ymd: string): { startStr: string; endStr: string } {
  const y = parseYearFromYmd(ymd)
  return yearRangeYmd(y)
}

/** 요일 평균 기반 기간 예상 매출 */
export function computeSalesForecast(params: {
  horizon: ForecastHorizon
  anchorYmd: string
  lookbackDailyRows: PeriodAggRow[]
  actualDailyRows: PeriodAggRow[]
  lookbackDays?: number
}): SalesForecastSummary {
  const anchor = String(params.anchorYmd || '').slice(0, 10)
  const lookbackDays = Math.max(14, Math.min(365, params.lookbackDays ?? 84))
  const lookbackEnd = anchor
  const lookbackStart = addBangkokCalendarDays(anchor, -(lookbackDays - 1))

  let rangeStart = anchor
  let rangeEnd = anchor
  if (params.horizon === 'week') {
    const w = weekRangeContainingYmd(anchor)
    rangeStart = w.startStr
    rangeEnd = w.endStr
  } else if (params.horizon === 'month') {
    const { year, month } = parseYearMonthFromYmd(anchor)
    const m = monthRangeYmd(year, month)
    rangeStart = m.startStr
    rangeEnd = m.endStr
  } else {
    const y = yearRangeContainingYmd(anchor)
    rangeStart = y.startStr
    rangeEnd = y.endStr
  }

  const dowAverages = computeDowAverageMap(params.lookbackDailyRows)
  const actualMap = indexDailyTotals(params.actualDailyRows)

  let actualToDate = 0
  let projectedRemaining = 0
  let completedDays = 0
  let remainingDays = 0

  for (const ymd of iterBangkokYmdInclusive(rangeStart, rangeEnd)) {
    if (ymd <= anchor) {
      completedDays += 1
      actualToDate += actualMap.get(ymd) ?? 0
    } else {
      remainingDays += 1
      const dow = getDayOfWeekBangkok(ymd)
      projectedRemaining += dowAverages[dow] ?? 0
    }
  }

  actualToDate = Math.round(actualToDate * 100) / 100
  projectedRemaining = Math.round(projectedRemaining * 100) / 100

  return {
    horizon: params.horizon,
    rangeStart,
    rangeEnd,
    lookbackStart,
    lookbackEnd,
    actualToDate,
    projectedRemaining,
    expectedTotal: Math.round((actualToDate + projectedRemaining) * 100) / 100,
    completedDays,
    remainingDays,
    dowAverages,
  }
}

export function sumYoyMonthMetrics(rows: YoyMonthCompareRow[], side: 'prevYear' | 'currYear'): SalesCompareMetrics {
  const acc = emptyMetrics()
  for (const r of rows) {
    const m = r[side]
    acc.orderCount += m.orderCount
    acc.total += m.total
    acc.guestSum += m.guestSum
  }
  acc.total = Math.round(acc.total * 100) / 100
  acc.salesPerGuest =
    acc.guestSum > 0 ? Math.round((acc.total / acc.guestSum) * 100) / 100 : 0
  return acc
}

export function sumMomDayMetrics(rows: MomDayCompareRow[], side: 'prevMonth' | 'currMonth'): SalesCompareMetrics {
  const acc = emptyMetrics()
  for (const r of rows) {
    const m = r[side]
    acc.orderCount += m.orderCount
    acc.total += m.total
    acc.guestSum += m.guestSum
  }
  acc.total = Math.round(acc.total * 100) / 100
  acc.salesPerGuest =
    acc.guestSum > 0 ? Math.round((acc.total / acc.guestSum) * 100) / 100 : 0
  return acc
}
