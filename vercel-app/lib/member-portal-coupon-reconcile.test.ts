import { describe, expect, it } from 'vitest'
import { couponIssueEligibleForOrderTime } from '@/lib/member-portal-coupon-status'

describe('member-portal-coupon-reconcile timing', () => {
  it('allows matching when coupon was issued before POS use', () => {
    expect(couponIssueEligibleForOrderTime('2026-06-30 13:05:00', '2026-06-30 13:06:00')).toBe(true)
  })

  it('blocks matching when coupon was claimed after POS use (Jayle case)', () => {
    expect(couponIssueEligibleForOrderTime('2026-06-30 13:08:00', '2026-06-30 13:06:00')).toBe(false)
  })

  it('blocks matching when order time is missing; allows when issue time is missing', () => {
    expect(couponIssueEligibleForOrderTime('', '2026-06-30 13:06:00')).toBe(true)
    expect(couponIssueEligibleForOrderTime('2026-06-30 13:08:00', '')).toBe(false)
  })
})
