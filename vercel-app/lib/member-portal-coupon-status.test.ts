import { describe, expect, it } from 'vitest'
import {
  couponIssueEligibleForOrderTime,
  isMemberPortalCouponReady,
  resolveMemberPortalCouponStatus,
} from '@/lib/member-portal-coupon-status'

describe('member-portal-coupon-status', () => {
  it('treats redeemed issue ids as used even when status is issued', () => {
    const status = resolveMemberPortalCouponStatus(
      { id: 42, status: 'issued' },
      new Set([42])
    )
    expect(status).toBe('used')
    expect(isMemberPortalCouponReady(status)).toBe(false)
  })

  it('keeps issued coupons ready when not redeemed', () => {
    const status = resolveMemberPortalCouponStatus({ id: 7, status: 'issued' }, new Set([42]))
    expect(status).toBe('issued')
    expect(isMemberPortalCouponReady(status)).toBe(true)
  })

  it('passes through used status', () => {
    expect(resolveMemberPortalCouponStatus({ id: 1, status: 'used' })).toBe('used')
  })
})

describe('couponIssueEligibleForOrderTime', () => {
  it('compares Bangkok issued_at against UTC paid_at ISO correctly', () => {
    // 결제 19:09 방콕 = 12:09 UTC — 오후 발급도 결제 전으로 인정
    expect(
      couponIssueEligibleForOrderTime('2026-07-18 15:00:00', '2026-07-18T12:09:08.000Z')
    ).toBe(true)
    expect(
      couponIssueEligibleForOrderTime('2026-07-18 19:09:08', '2026-07-18T12:09:08.000Z')
    ).toBe(true)
  })

  it('rejects claim issued after payment when both are Bangkok wall clock', () => {
    expect(
      couponIssueEligibleForOrderTime('2026-07-18 19:10:00', '2026-07-18T12:09:08.000Z')
    ).toBe(false)
  })

  it('does not treat missing issued_at as ineligible (avoids used→issued revert)', () => {
    expect(couponIssueEligibleForOrderTime('', '2026-07-18T12:09:08.000Z')).toBe(true)
    expect(couponIssueEligibleForOrderTime(null, '2026-07-18T12:09:08.000Z')).toBe(true)
  })
})
