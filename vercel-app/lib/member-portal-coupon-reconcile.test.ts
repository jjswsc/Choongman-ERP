import { describe, expect, it } from 'vitest'
import { resolveMemberPortalCouponStatus } from '@/lib/member-portal-coupon-status'

describe('member-portal-coupon-reconcile integration with status', () => {
  it('marks issued row with redemption metadata as used', () => {
    const usedIds = new Set([99])
    expect(
      resolveMemberPortalCouponStatus(
        { id: 99, status: 'issued', couponCode: 'BIRTHDAY' },
        usedIds
      )
    ).toBe('used')
  })

  it('marks issued row with order linkage as used', () => {
    expect(
      resolveMemberPortalCouponStatus({
        id: 12,
        status: 'issued',
        orderId: 5001,
        usedAt: '2026-06-29 12:00:00',
      })
    ).toBe('used')
  })
})
