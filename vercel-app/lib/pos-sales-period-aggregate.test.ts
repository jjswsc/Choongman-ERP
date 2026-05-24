import { describe, expect, it } from 'vitest'
import type { PeriodAggRow } from '@/lib/pos-sales-period-aggregate'
import {
  mergePeriodSeriesToAggregated,
  periodRowsForStoreSelection,
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
