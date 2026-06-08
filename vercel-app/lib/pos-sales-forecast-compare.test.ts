import { describe, expect, it } from 'vitest'
import type { PeriodAggRow } from '@/lib/pos-sales-period-aggregate'
import {
  buildMomDayCompareRows,
  buildYoyMonthCompareRows,
  computeDowAverageMap,
  computeSalesForecast,
  pctChange,
} from '@/lib/pos-sales-forecast-compare'

function dayRow(key: string, total: number, count: number, guests = 0): PeriodAggRow {
  return {
    key,
    label: key,
    sales: total,
    count,
    subtotal: total,
    vat: 0,
    discount: 0,
    service: 0,
    total,
    guestSum: guests,
    dineInOrderCount: count,
    dineInTotal: total,
    dineInGuestSum: guests,
    salesPerDineInOrder: count > 0 ? total / count : 0,
    salesPerGuest: guests > 0 ? total / guests : 0,
    salesPerOrder: count > 0 ? total / count : 0,
    cashSales: 0,
    creditSales: 0,
    qrSales: 0,
    otherSales: 0,
    deliveryAppSales: 0,
  }
}

describe('buildYoyMonthCompareRows', () => {
  it('aligns months and computes YoY %', () => {
    const rows = buildYoyMonthCompareRows({
      year: 2026,
      prevYearRows: [dayRow('2025-01', 100, 10, 8)],
      currYearRows: [dayRow('2026-01', 120, 12, 9)],
    })
    expect(rows[0]?.month).toBe(1)
    expect(rows[0]?.prevYear.total).toBe(100)
    expect(rows[0]?.currYear.total).toBe(120)
    expect(rows[0]?.changePct.total).toBe(20)
  })
})

describe('buildMomDayCompareRows', () => {
  it('pairs same calendar day across months', () => {
    const rows = buildMomDayCompareRows({
      year: 2026,
      month: 5,
      prevMonthRows: [dayRow('2026-04-01', 50, 5, 4)],
      currMonthRows: [dayRow('2026-05-01', 60, 6, 5)],
    })
    expect(rows[0]?.day).toBe(1)
    expect(rows[0]?.prevMonth.total).toBe(50)
    expect(rows[0]?.currMonth.total).toBe(60)
    expect(rows[0]?.changePct.total).toBe(20)
  })
})

describe('computeSalesForecast', () => {
  it('uses DOW averages for days after anchor', () => {
    const lookback: PeriodAggRow[] = []
    for (let i = 0; i < 14; i++) {
      const key = `2026-04-${String(i + 1).padStart(2, '0')}`
      lookback.push(dayRow(key, 1000, 10, 8))
    }
    const actual = [dayRow('2026-05-01', 500, 5, 4), dayRow('2026-05-02', 600, 6, 5)]
    const forecast = computeSalesForecast({
      horizon: 'month',
      anchorYmd: '2026-05-02',
      lookbackDailyRows: lookback,
      actualDailyRows: actual,
      lookbackDays: 14,
    })
    expect(forecast.actualToDate).toBe(1100)
    expect(forecast.expectedTotal).toBeGreaterThan(forecast.actualToDate)
    expect(forecast.remainingDays).toBeGreaterThan(0)
  })
})

describe('pctChange', () => {
  it('returns null when prior is zero and current is positive', () => {
    expect(pctChange(10, 0)).toBeNull()
  })
})

describe('computeDowAverageMap', () => {
  it('returns 7 dow slots', () => {
    const map = computeDowAverageMap([dayRow('2026-05-03', 300, 3, 2)])
    expect(Object.keys(map).length).toBe(7)
  })
})
