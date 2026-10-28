import { describe, expect, it } from 'vitest'
import { iterBangkokYmdInclusive } from '@/lib/attendance-utils'
import {
  mergePosSalesAnalyticsAggRows,
  splitPosSalesAnalyticsYmdChunks,
} from '@/lib/pos-sales-analytics-rpc-chunk'

describe('splitPosSalesAnalyticsYmdChunks', () => {
  it('keeps a range within 31 days as one chunk', () => {
    expect(splitPosSalesAnalyticsYmdChunks('2026-06-01', '2026-07-01')).toEqual([
      { startStr: '2026-06-01', endStr: '2026-07-01' },
    ])
  })

  it('splits 2026-06-01..2026-10-28 without gaps or overlaps', () => {
    const chunks = splitPosSalesAnalyticsYmdChunks('2026-06-01', '2026-10-28')
    expect(chunks.length).toBeGreaterThan(1)
    const days = chunks.flatMap((c) => iterBangkokYmdInclusive(c.startStr, c.endStr))
    expect(days).toEqual(iterBangkokYmdInclusive('2026-06-01', '2026-10-28'))
    expect(new Set(days).size).toBe(days.length)
  })
})

describe('mergePosSalesAnalyticsAggRows', () => {
  it('sums the same store across chunks and keeps other stores', () => {
    const merged = mergePosSalesAnalyticsAggRows([
      { bucket_key: 'CM 101', bucket_key2: '', payment_key: null, order_count: 2, total: 100 },
      { bucket_key: 'CM 101', bucket_key2: '', payment_key: null, order_count: '3', total: 40 },
      { bucket_key: 'CM 202', bucket_key2: '', payment_key: null, order_count: 1, total: 10 },
    ])
    const byStore = Object.fromEntries(merged.map((r) => [r.bucket_key, r]))
    expect(byStore['CM 101']?.order_count).toBe(5)
    expect(byStore['CM 101']?.total).toBe(140)
    expect(byStore['CM 202']?.total).toBe(10)
  })
})
