import { describe, expect, it } from 'vitest'
import {
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
