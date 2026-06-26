import { describe, expect, it } from 'vitest'
import {
  posOrderCouponFieldsFromOrderRow,
  posOrderCouponFieldsFromPayload,
} from '@/lib/pos-order-coupon-fields'

describe('posOrderCouponFieldsFromPayload', () => {
  it('prefers appliedCoupons with member issue id over legacy fields', () => {
    const fields = posOrderCouponFieldsFromPayload({
      couponCode: 'LEGACY',
      couponDiscountAmt: 10,
      appliedCoupons: [
        {
          code: 'MEMCPN',
          name: 'Member coupon',
          discountAmt: 50,
          quantity: 1,
          memberCouponIssueId: 99,
        },
      ],
    })
    expect(fields.appliedCoupons).toHaveLength(1)
    expect(fields.appliedCoupons?.[0]?.memberCouponIssueId).toBe(99)
    expect(fields.couponCode).toBe('MEMCPN')
    expect(fields.couponDiscountAmt).toBe(50)
  })
})

describe('posOrderCouponFieldsFromOrderRow', () => {
  it('parses applied_coupons json from order row', () => {
    const fields = posOrderCouponFieldsFromOrderRow({
      couponCode: 'OLD',
      couponDiscountAmt: 5,
      applied_coupons: [{ code: 'ROWCPN', name: 'Row', discount_amt: 20, quantity: 1 }],
    })
    expect(fields.appliedCoupons?.[0]?.code).toBe('ROWCPN')
    expect(fields.couponDiscountAmt).toBe(20)
  })
})
