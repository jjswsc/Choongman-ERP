import { describe, expect, it } from 'vitest'
import {
  posOrderCouponFieldsFromOrderRow,
  posOrderCouponFieldsFromPayload,
  resolveAppliedCouponsForOrderDbSave,
  isPosOrderCouponPaymentSettled,
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

describe('mergePosOrderAppliedCouponsFromRequest', () => {
  it('falls back to existing order applied_coupons when payment body omits them', async () => {
    const { mergePosOrderAppliedCouponsFromRequest } = await import('@/lib/pos-order-coupon-fields')
    const merged = mergePosOrderAppliedCouponsFromRequest(
      { paymentCash: 100 },
      [{ code: 'GDF100P', name: 'GDF', discount_amt: 50, quantity: 1, member_coupon_issue_id: 42 }]
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.code).toBe('GDF100P')
    expect(merged[0]?.memberCouponIssueId).toBe(42)
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

describe('resolveAppliedCouponsForOrderDbSave', () => {
  it('keeps appliedPre when server revalidation strips coupons', () => {
    const appliedPre = [
      { code: 'CMV100P', name: 'CMV100P', discountAmt: 100, quantity: 1, memberCouponIssueId: 10 },
      { code: 'GDF100P', name: 'GDF100P', discountAmt: 129, quantity: 1, memberCouponIssueId: 11 },
    ]
    const saved = resolveAppliedCouponsForOrderDbSave({
      appliedPre,
      validated: [],
      validatedCouponCode: '',
      validatedCouponDiscountAmt: 0,
    })
    expect(saved.appliedCoupons).toHaveLength(2)
    expect(saved.appliedCouponsJson).toHaveLength(2)
    expect(saved.couponCode).toContain('CMV100P')
    expect(saved.couponDiscountAmt).toBe(229)
  })
})

describe('isPosOrderCouponPaymentSettled', () => {
  it('treats coupon-only zero-total checkout as settled', () => {
    expect(
      isPosOrderCouponPaymentSettled({
        total: 0,
        paymentSum: 0,
        preCouponSum: 129,
        appliedPreCount: 1,
      })
    ).toBe(true)
  })

  it('requires payment sum for positive totals', () => {
    expect(
      isPosOrderCouponPaymentSettled({
        total: 500,
        paymentSum: 400,
      })
    ).toBe(false)
    expect(
      isPosOrderCouponPaymentSettled({
        total: 500,
        paymentSum: 500,
      })
    ).toBe(true)
  })
})
