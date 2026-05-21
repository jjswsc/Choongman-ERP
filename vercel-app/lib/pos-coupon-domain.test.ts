import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POS_LOYALTY_SETTINGS,
  resolveOrderDiscountAmt,
  resolvePosSalesDiscountAmount,
  summarizeLegacyCouponFields,
  validatePosCouponCandidate,
  type PosAppliedCouponLine,
  type PosCouponTemplate,
} from '@/lib/pos-coupon-domain'

const loyalty = DEFAULT_POS_LOYALTY_SETTINGS

const template100: PosCouponTemplate = {
  id: 1,
  code: 'ST100',
  name: '100 Baht',
  discountType: 'fixed',
  discountValue: 100,
  isActive: true,
  maxPerOrder: 10,
  allowQuantityEntry: true,
  redemptionMode: 'reusable_code',
  stackMode: 'fixed_only',
}

function ctx(applied: PosAppliedCouponLine[] = [], subtotal = 500, manual = 0) {
  return {
    subtotal,
    manualDiscountAmt: manual,
    applied,
    todayYmd: '2026-05-21',
    loyalty,
  }
}

describe('validatePosCouponCandidate', () => {
  it('applies 100 baht against remaining subtotal (The Street 500/100×4)', () => {
    let applied: PosAppliedCouponLine[] = []
    for (let i = 0; i < 4; i += 1) {
      const res = validatePosCouponCandidate(template100, ctx(applied), { code: 'ST100' })
      expect(res.valid).toBe(true)
      expect(res.discountAmt).toBe(100)
      applied = res.appliedCoupons ?? applied
    }
    expect(applied).toHaveLength(4)
    expect(applied.reduce((s, r) => s + r.discountAmt, 0)).toBe(400)
  })

  it('supports quantity entry for reusable code', () => {
    const res = validatePosCouponCandidate(template100, ctx(), { code: 'ST100', quantity: 4 })
    expect(res.valid).toBe(true)
    expect(res.discountAmt).toBe(400)
    expect(res.quantity).toBe(4)
  })

  it('rejects when exceeding max coupons per order', () => {
    const limited = { ...loyalty, maxCouponsPerOrder: 3 }
    const res = validatePosCouponCandidate(
      template100,
      { ...ctx([], 500), loyalty: limited },
      { code: 'ST100', quantity: 4 }
    )
    expect(res.valid).toBe(false)
  })

  it('rejects when no remaining subtotal', () => {
    const applied: PosAppliedCouponLine[] = [
      { code: 'ST100', discountAmt: 500, quantity: 5 },
    ]
    const res = validatePosCouponCandidate(template100, ctx(applied, 500), { code: 'ST100' })
    expect(res.valid).toBe(false)
  })
})

describe('summarizeLegacyCouponFields', () => {
  it('formats single and multi codes', () => {
    expect(
      summarizeLegacyCouponFields([{ code: 'A', discountAmt: 100, quantity: 4 }]).couponCode
    ).toBe('A×4')
    expect(
      summarizeLegacyCouponFields([
        { code: 'A', discountAmt: 100 },
        { code: 'B', discountAmt: 50 },
      ]).couponDiscountAmt
    ).toBe(150)
  })
})

describe('resolveOrderDiscountAmt', () => {
  it('caps total discount at subtotal', () => {
    expect(
      resolveOrderDiscountAmt({
        manualDiscountAmt: 100,
        couponDiscountAmt: 450,
        subtotal: 500,
      })
    ).toBe(500)
  })
})

describe('resolvePosSalesDiscountAmount', () => {
  it('avoids double counting when discount already includes coupon', () => {
    expect(resolvePosSalesDiscountAmount(400, 400)).toBe(400)
  })

  it('adds coupon when legacy rows only stored coupon separately', () => {
    expect(resolvePosSalesDiscountAmount(0, 100)).toBe(100)
  })
})
