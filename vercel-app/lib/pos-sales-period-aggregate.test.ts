import { describe, expect, it } from 'vitest'
import type { PeriodAggRow } from '@/lib/pos-sales-period-aggregate'
import { mergePeriodSeriesToAggregated } from '@/lib/pos-sales-period-aggregate'

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
