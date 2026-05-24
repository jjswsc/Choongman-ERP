import { describe, expect, it } from 'vitest'
import type { PeriodAggRow } from '@/lib/pos-sales-period-aggregate'
import {
  buildPosSalesSplitSeriesByStore,
  groupPosSalesRowsByCanonicalStore,
  mergePeriodSeriesToAggregated,
  periodRowsForStoreSelection,
  resolvePeriodSeriesStoreKey,
  type PeriodOrderRow,
} from '@/lib/pos-sales-period-aggregate'

function row(key: string, total: number, count: number): PeriodAggRow {
  return {
    key,
    label: key,
    sales: total,
    count,
    subtotal: total,
    vat: 0,
    discount: 0,
    total,
    guestSum: 0,
    dineInOrderCount: 0,
    dineInTotal: 0,
    dineInGuestSum: 0,
    salesPerDineInOrder: 0,
    salesPerGuest: 0,
    salesPerOrder: count > 0 ? total / count : 0,
  }
}

describe('mergePeriodSeriesToAggregated', () => {
  it('sums metrics by key following storeOrder', () => {
    const series = {
      S1: [row('2025-01', 100, 2), row('2025-02', 50, 1)],
      S2: [row('2025-01', 30, 1), row('2025-02', 70, 3)],
    }
    const merged = mergePeriodSeriesToAggregated(series, ['S2', 'S1'])
    expect(merged.map((r) => r.key)).toEqual(['2025-01', '2025-02'])
    expect(merged[0]?.total).toBe(130)
    expect(merged[0]?.count).toBe(3)
    expect(merged[1]?.total).toBe(120)
    expect(merged[1]?.count).toBe(4)
  })

  it('returns empty when no series', () => {
    expect(mergePeriodSeriesToAggregated({})).toEqual([])
  })
})

describe('groupPosSalesRowsByCanonicalStore', () => {
  it('merges CM prefix variants into one store bucket', () => {
    const rows: PeriodOrderRow[] = [
      {
        store_code: 'Ekkamai',
        status: 'completed',
        total: 100,
        created_at: '2026-05-01T12:00:00Z',
      },
      {
        store_code: 'CM Ekkamai',
        status: 'completed',
        total: 200,
        created_at: '2026-05-01T13:00:00Z',
      },
    ]
    const grouped = groupPosSalesRowsByCanonicalStore(rows, null)
    expect(grouped.size).toBe(1)
    const only = [...grouped.values()][0]
    expect(only?.length).toBe(2)
    expect(only?.reduce((s, r) => s + (Number(r.total) || 0), 0)).toBe(300)
  })
})

describe('buildPosSalesSplitSeriesByStore', () => {
  it('daily totals match posSalesByStore row set for one selected store', () => {
    const rows: PeriodOrderRow[] = [
      {
        store_code: 'Ekkamai',
        status: 'completed',
        total: 100,
        subtotal: 90,
        created_at: '2026-05-01T12:00:00Z',
      },
      {
        store_code: 'CM Ekkamai',
        status: 'completed',
        total: 50,
        subtotal: 45,
        created_at: '2026-05-02T12:00:00Z',
      },
      {
        store_code: 'CM Other',
        status: 'completed',
        total: 999,
        created_at: '2026-05-02T12:00:00Z',
      },
    ]
    const grouped = groupPosSalesRowsByCanonicalStore(rows, null)
    const storeTotal = [...grouped.entries()]
      .filter(([k]) => k.includes('Ekkamai'))
      .reduce((s, [, list]) => s + list.reduce((a, r) => a + (Number(r.total) || 0), 0), 0)

    const series = buildPosSalesSplitSeriesByStore({
      rows,
      stores: ['CM Ekkamai'],
      groupBy: 'day',
      orderTypesAllowed: null,
      resolveBusinessDayStart: () => ({ start: '06:00', end: '05:59' }),
    })
    const daily = periodRowsForStoreSelection(series, ['CM Ekkamai'])
    const dailyTotal = daily.reduce((s, r) => s + r.total, 0)
    expect(dailyTotal).toBe(150)
    expect(storeTotal).toBe(150)
  })
})

describe('resolvePeriodSeriesStoreKey', () => {
  it('resolves alias selection to canonical series key', () => {
    const series = {
      'CM True Digital': [row('2026-05-01', 100, 1)],
    }
    expect(resolvePeriodSeriesStoreKey(series, 'True Digital')).toBe('CM True Digital')
    expect(resolvePeriodSeriesStoreKey(series, 'CM True Digital')).toBe('CM True Digital')
    expect(resolvePeriodSeriesStoreKey(series, 'Other')).toBeUndefined()
  })
})

describe('periodRowsForStoreSelection', () => {
  it('picks canonical series only for one store (does not sum alias keys)', () => {
    const series = {
      'CM True Digital': [row('2026-05-01', 321_732, 923)],
      'True Digital': [row('2026-05-01', 457_375, 400)],
    }
    const picked = periodRowsForStoreSelection(series, ['CM True Digital'])
    expect(picked).toHaveLength(1)
    expect(picked[0]?.total).toBe(321_732)
  })

  it('does not include a different store that partially matches the name', () => {
    const series = {
      'CM True Digital': [row('2026-05-01', 100, 1)],
      'CM True Digital Park': [row('2026-05-01', 50, 1)],
    }
    const picked = periodRowsForStoreSelection(series, ['CM True Digital'])
    expect(picked[0]?.total).toBe(100)
  })

  it('merges multiple selected stores using canonical series keys (not selection aliases)', () => {
    const series = {
      'CM Store A': [row('2026-05-01', 100, 1)],
      'CM Store B': [row('2026-05-01', 200, 2)],
    }
    const picked = periodRowsForStoreSelection(series, ['Store A', 'Store B'])
    expect(picked).toHaveLength(1)
    expect(picked[0]?.total).toBe(300)
    expect(picked[0]?.count).toBe(3)
  })
})
