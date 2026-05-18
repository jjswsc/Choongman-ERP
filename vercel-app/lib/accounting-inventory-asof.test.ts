import { describe, expect, it } from 'vitest'
import { resolveInventoryAsOfUtcIso } from '@/lib/accounting-inventory-asof'
import { getBangkokDateRangeUtc, getBangkokEndOfDayUtcIso } from '@/lib/bangkok-time'

describe('resolveInventoryAsOfUtcIso', () => {
  it('기말재고는 해당일 방콕 말 시각(<=)과 동일', () => {
    const end = '2025-04-30'
    expect(resolveInventoryAsOfUtcIso(end, false)).toBe(getBangkokEndOfDayUtcIso(end))
  })

  it('기초재고는 월초 직전(기존 log_date<월초)와 동일 상한', () => {
    const start = '2025-04-01'
    const legacyLt = getBangkokDateRangeUtc(start, start).dayStartUtcIso
    const asOf = resolveInventoryAsOfUtcIso(start, true)
    expect(asOf < legacyLt).toBe(true)
    expect(new Date(asOf).getTime()).toBe(new Date(getBangkokEndOfDayUtcIso('2025-03-31')).getTime())
  })
})
