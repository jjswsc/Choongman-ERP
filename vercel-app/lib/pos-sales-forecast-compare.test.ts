import { describe, expect, it } from 'vitest'
import type { PeriodAggRow } from '@/lib/pos-sales-period-aggregate'
import {
  buildMomDayCompareRows,
  buildMomStoreChannelCompareRows,
  buildMomStoreCompareRows,
  buildYoyMonthCompareRows,
  buildYoyStoreCompareRows,
  computeDowAverageMap,
  computeSalesForecast,
  pctChange,
  resolveForecastFetchPlan,
  resolveMomStoreDriver,
  sumPeriodRowTotals,
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

describe('buildMomStoreCompareRows', () => {
  it('joins stores across months and computes MoM %', () => {
    const rows = buildMomStoreCompareRows({
      prevMonthRows: [
        { storeName: 'Bangkok', count: 10, total: 1000, dineInGuestSum: 80 },
        { storeName: 'Silom', count: 5, total: 500, dineInGuestSum: 40 },
      ],
      currMonthRows: [
        { storeName: 'Bangkok', count: 12, total: 1200, dineInGuestSum: 90 },
        { storeName: 'Chiangmai', count: 3, total: 300, dineInGuestSum: 20 },
      ],
    })
    expect(rows.map((r) => r.storeName)).toEqual(['Bangkok', 'Chiangmai', 'Silom'])
    expect(rows[0]?.currMonth.total).toBe(1200)
    expect(rows[0]?.prevMonth.total).toBe(1000)
    expect(rows[0]?.changePct.total).toBe(20)
    expect(rows[0]?.changeAbs.total).toBe(200)
    expect(rows[0]?.changePct.orderCount).toBe(20)
    expect(rows[0]?.driver).toBe('volume')
    expect(rows[1]?.prevMonth.total).toBe(0)
    expect(rows[1]?.changePct.total).toBeNull()
    expect(rows[1]?.driver).toBe('new')
    expect(rows[2]?.currMonth.total).toBe(0)
    expect(rows[2]?.changePct.total).toBe(-100)
    expect(rows[2]?.driver).toBe('closed')
  })
})

describe('buildYoyStoreCompareRows', () => {
  it('joins stores across years for same calendar month', () => {
    const rows = buildYoyStoreCompareRows({
      prevYearRows: [{ storeName: 'Silom', count: 10, total: 1000, dineInGuestSum: 80 }],
      currYearRows: [{ storeName: 'Silom', count: 11, total: 1100, dineInGuestSum: 88 }],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.changePct.total).toBe(10)
    expect(rows[0]?.changeAbs.total).toBe(100)
  })
})

describe('buildMomStoreChannelCompareRows', () => {
  it('computes channel share and delivery pp change', () => {
    const rows = buildMomStoreChannelCompareRows({
      prevMonthRows: [{ storeName: 'A', dineIn: 70, takeout: 10, delivery: 20 }],
      currMonthRows: [{ storeName: 'A', dineIn: 50, takeout: 10, delivery: 40 }],
    })
    expect(rows[0]?.prevMonth.deliveryPct).toBe(20)
    expect(rows[0]?.currMonth.deliveryPct).toBe(40)
    expect(rows[0]?.deliveryShareDiffPp).toBe(20)
  })
})

describe('resolveMomStoreDriver', () => {
  it('classifies volume vs ticket vs mixed', () => {
    expect(
      resolveMomStoreDriver({
        prevTotal: 100,
        currTotal: 120,
        orderCountPct: 20,
        salesPerOrderPct: 0,
      })
    ).toBe('volume')
    expect(
      resolveMomStoreDriver({
        prevTotal: 100,
        currTotal: 120,
        orderCountPct: 0,
        salesPerOrderPct: 20,
      })
    ).toBe('ticket')
    expect(
      resolveMomStoreDriver({
        prevTotal: 100,
        currTotal: 120,
        orderCountPct: 10,
        salesPerOrderPct: 10,
      })
    ).toBe('mixed')
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

  it('uses actualToDateOverride for year horizon without daily YTD', () => {
    const lookback = [dayRow('2026-10-01', 1000, 10, 8)]
    const forecast = computeSalesForecast({
      horizon: 'year',
      anchorYmd: '2026-10-20',
      lookbackDailyRows: lookback,
      actualDailyRows: lookback,
      actualToDateOverride: 5_000_000,
    })
    expect(forecast.actualToDate).toBe(5_000_000)
    expect(forecast.rangeStart).toBe('2026-01-01')
    expect(forecast.rangeEnd).toBe('2026-12-31')
    expect(forecast.expectedTotal).toBeGreaterThan(forecast.actualToDate)
  })
})

describe('resolveForecastFetchPlan', () => {
  it('keeps month actual as year-to-date for any horizon', () => {
    const plan = resolveForecastFetchPlan({ horizon: 'week', anchorYmd: '2026-10-20' })
    expect(plan.monthActualStart).toBe('2026-01-01')
    expect(plan.monthActualEnd).toBe('2026-10-20')
    expect(plan.lookbackEnd).toBe('2026-10-20')
  })
})

describe('sumPeriodRowTotals', () => {
  it('sums totals', () => {
    expect(sumPeriodRowTotals([dayRow('2026-01', 100, 1), dayRow('2026-02', 50.5, 1)])).toBe(150.5)
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
