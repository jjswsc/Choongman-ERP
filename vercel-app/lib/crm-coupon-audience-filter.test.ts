import { describe, expect, it } from 'vitest'
import { addBangkokCalendarDays, addBangkokCalendarYears, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { birthDateBoundsForAge, buildMemberProfileFilterQuery } from '@/lib/crm-coupon-audience-filter'

describe('addBangkokCalendarYears', () => {
  it('moves years and clamps leap day', () => {
    expect(addBangkokCalendarYears('2024-02-29', 1)).toBe('2025-02-28')
    expect(addBangkokCalendarYears('2020-07-16', -20)).toBe('2000-07-16')
  })
})

describe('birthDateBoundsForAge', () => {
  it('builds inclusive age range from Bangkok today', () => {
    const today = getBangkokTodayDateString()
    const bounds = birthDateBoundsForAge(20, 29)
    expect(bounds.lte).toBe(addBangkokCalendarYears(today, -20))
    expect(bounds.gte).toBe(addBangkokCalendarDays(addBangkokCalendarYears(today, -30), 1))
  })
})

describe('buildMemberProfileFilterQuery', () => {
  it('combines gender, tier, store, join range', () => {
    const q = buildMemberProfileFilterQuery({
      gender: 'f',
      tierCode: 'gold',
      joinStoreCode: 'BKK01',
      joinFrom: '2026-01-01',
      joinTo: '2026-06-30',
    })
    expect(q).toContain('status=eq.active')
    expect(q).toContain('gender=eq.F')
    expect(q).toContain('tier_code=eq.GOLD')
    expect(q).toContain('join_store_code=eq.BKK01')
    expect(q).toContain('created_at=gte.')
    expect(q).toContain('created_at=lte.')
  })
})
