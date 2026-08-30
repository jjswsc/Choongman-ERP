import { describe, expect, it } from 'vitest'
import { getDayOfWeekBangkok, iterBangkokYmdInclusive } from '@/lib/attendance-utils'

describe('iterBangkokYmdInclusive', () => {
  it('lists consecutive Bangkok calendar days inclusive', () => {
    expect(iterBangkokYmdInclusive('2026-05-12', '2026-05-12')).toEqual(['2026-05-12'])
    expect(iterBangkokYmdInclusive('2026-05-12', '2026-05-14')).toEqual(['2026-05-12', '2026-05-13', '2026-05-14'])
  })

  it('swaps when start > end', () => {
    expect(iterBangkokYmdInclusive('2026-05-14', '2026-05-12')).toEqual(['2026-05-12', '2026-05-13', '2026-05-14'])
  })
})

describe('getDayOfWeekBangkok', () => {
  it('returns JS getDay values for known Bangkok calendar dates', () => {
    expect(getDayOfWeekBangkok('2026-08-07')).toBe(5) // Fri
    expect(getDayOfWeekBangkok('2026-08-08')).toBe(6) // Sat
    expect(getDayOfWeekBangkok('2026-08-09')).toBe(0) // Sun
    expect(getDayOfWeekBangkok('2026-08-10')).toBe(1) // Mon
  })
})
