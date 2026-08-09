import { describe, expect, it } from 'vitest'
import type { PeriodAggRow } from '@/lib/pos-sales-period-aggregate'
import {
  aggregatePosSalesByPeriod,
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
    service: 0,
    total,
    guestSum: 0,
    dineInOrderCount: 0,
    dineInTotal: 0,
    dineInGuestSum: 0,
    salesPerDineInOrder: 0,
    salesPerGuest: 0,
    salesPerOrder: count > 0 ? total / count : 0,
    cashSales: 0,
    creditSales: 0,
    qrSales: 0,
    otherSales: 0,
    deliveryAppSales: 0,
  }
}

describe('mergePeriodSeriesToAggregated', () => {
  it('sums metrics by key following storeOrder', () => {
    const series = {
      S1: [
        { ...row('2025-01', 100, 2), cashSales: 40, qrSales: 10 },
        { ...row('2025-02', 50, 1), creditSales: 50 },
      ],
      S2: [
        { ...row('2025-01', 30, 1), cashSales: 20, deliveryAppSales: 5 },
        { ...row('2025-02', 70, 3), otherSales: 15 },
      ],
    }
    const merged = mergePeriodSeriesToAggregated(series, ['S2', 'S1'])
    expect(merged.map((r) => r.key)).toEqual(['2025-01', '2025-02'])
    expect(merged[0]?.total).toBe(130)
    expect(merged[0]?.count).toBe(3)
    expect(merged[0]?.cashSales).toBe(60)
    expect(merged[0]?.qrSales).toBe(10)
    expect(merged[0]?.deliveryAppSales).toBe(5)
    expect(merged[1]?.total).toBe(120)
    expect(merged[1]?.count).toBe(4)
    expect(merged[1]?.creditSales).toBe(50)
    expect(merged[1]?.otherSales).toBe(15)
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

describe('aggregatePosSalesByPeriod', () => {
  it('sums payment columns per day bucket', () => {
    const rows: PeriodOrderRow[] = [
      {
        store_code: 'S1',
        status: 'completed',
        total: 100,
        created_at: '2026-05-01T12:00:00Z',
        payment_cash: 60,
        payment_card: 40,
      },
      {
        store_code: 'S1',
        status: 'completed',
        total: 50,
        created_at: '2026-05-01T14:00:00Z',
        payment_qr: 30,
        payment_other: 20,
      },
      {
        store_code: 'S1',
        status: 'completed',
        total: 80,
        created_at: '2026-05-02T10:00:00Z',
        payment_delivery_app: 80,
      },
    ]
    const agg = aggregatePosSalesByPeriod(rows, 'day', null, { start: '06:00', end: '05:59' })
    expect(agg).toHaveLength(2)
    const d1 = agg.find((r) => r.key === '2026-05-01')
    const d2 = agg.find((r) => r.key === '2026-05-02')
    expect(d1?.total).toBe(150)
    expect(d1?.cashSales).toBe(60)
    expect(d1?.creditSales).toBe(40)
    expect(d1?.qrSales).toBe(30)
    expect(d1?.otherSales).toBe(20)
    expect(d2?.deliveryAppSales).toBe(80)
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

describe('aggregatePosSalesByPeriod daysOfWeek filter', () => {
  // 2026-08-07 = Fri, 2026-08-08 = Sat, 2026-08-09 = Sun (Bangkok business ymd via default hours)
  const sample: PeriodOrderRow[] = [
    {
      store_code: 'S1',
      status: 'completed',
      total: 100,
      created_at: '2026-08-07T05:00:00.000Z', // Fri Bangkok afternoon
    },
    {
      store_code: 'S1',
      status: 'completed',
      total: 200,
      created_at: '2026-08-08T05:00:00.000Z', // Sat
    },
    {
      store_code: 'S1',
      status: 'completed',
      total: 50,
      created_at: '2026-08-09T05:00:00.000Z', // Sun
    },
  ]

  it('keeps only selected weekdays for day buckets', () => {
    const rows = aggregatePosSalesByPeriod(sample, 'day', null, undefined, undefined, [5, 6])
    expect(rows.map((r) => r.key).sort()).toEqual(['2026-08-07', '2026-08-08'])
    expect(rows.find((r) => r.key === '2026-08-07')?.total).toBe(100)
    expect(rows.find((r) => r.key === '2026-08-08')?.total).toBe(200)
  })

  it('limits dow axis to selected days', () => {
    const rows = aggregatePosSalesByPeriod(sample, 'dow', null, undefined, undefined, [5, 6])
    expect(rows.map((r) => r.key)).toEqual(['5', '6'])
    expect(rows[0]?.total).toBe(100)
    expect(rows[1]?.total).toBe(200)
  })
})
