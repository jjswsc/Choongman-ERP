import { describe, expect, it } from 'vitest'
import {
  addPosTierPoints,
  formatMemberPointsDisplay,
  normalizeMemberPoints,
  roundMemberPointsEarn,
} from '@/lib/member-points-math'

describe('member-points-math', () => {
  it('rounds earn amounts to 2 decimals', () => {
    expect(roundMemberPointsEarn(259 * 0.01)).toBe(2.59)
    expect(roundMemberPointsEarn(2.591)).toBe(2.59)
    expect(roundMemberPointsEarn(2.595)).toBe(2.6)
  })

  it('formats whole and fractional points', () => {
    expect(formatMemberPointsDisplay(10)).toBe('10')
    expect(formatMemberPointsDisplay(2.59)).toBe('2.59')
  })

  it('normalizes signed ledger amounts', () => {
    expect(normalizeMemberPoints(-2.59)).toBe(-2.59)
  })

  it('adds only this earn to POS tier points and leaves LINE points out', () => {
    expect(addPosTierPoints(62.36, 16.74)).toBe(79.1)
    expect(addPosTierPoints(79.1, 0)).toBe(79.1)
    expect(addPosTierPoints(0, 16.74)).toBe(16.74)
  })
})
