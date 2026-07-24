import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POS_LOYALTY_SETTINGS,
  buildCouponDiscountLineAllocations,
  ensureAppliedCouponsInDiscountReason,
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

describe('buildCouponDiscountLineAllocations', () => {
  it('item_scope 쿠폰은 해당 메뉴 줄에만 배분한다', () => {
    const cartLines = [
      { menuId: '8', menuCode: 'C008', quantity: 1, lineSubtotal: 249 },
      { menuId: '9', menuCode: 'C023', quantity: 1, lineSubtotal: 249 },
    ]
    const applied = [
      {
        code: 'SNOW',
        discountAmt: 249,
        quantity: 1,
        itemScope: { menuIds: ['8'] },
        discountType: 'item_fixed' as const,
      },
    ]
    const alloc = buildCouponDiscountLineAllocations(cartLines, applied)
    expect(alloc[0]).toBe(249)
    expect(alloc[1]).toBe(0)
  })
})

describe('validatePosCouponCandidate item_fixed scope', () => {
  const snowTemplate: PosCouponTemplate = {
    id: 2,
    code: 'SNOW249',
    discountType: 'item_fixed',
    discountValue: 249,
    isActive: true,
    itemScope: { menuIds: ['8'] },
  }

  it('eligible 메뉴 1개에만 item_fixed 할인', () => {
    const res = validatePosCouponCandidate(
      snowTemplate,
      {
        ...ctx(),
        subtotal: 498,
        cartLines: [
          { menuId: '8', quantity: 1, lineSubtotal: 249 },
          { menuId: '9', quantity: 1, lineSubtotal: 249 },
        ],
      },
      { code: 'SNOW249' }
    )
    expect(res.valid).toBe(true)
    expect(res.discountAmt).toBe(249)
    expect(res.appliedCoupons?.[0]?.itemScope).toEqual({ menuIds: ['8'] })
  })

  it('복합 menuId(옵션 접미사)도 scope에 매칭', () => {
    const res = validatePosCouponCandidate(
      snowTemplate,
      {
        ...ctx(),
        subtotal: 249,
        cartLines: [{ menuId: '8-bone', quantity: 1, lineSubtotal: 249 }],
      },
      { code: 'SNOW249' }
    )
    expect(res.valid).toBe(true)
    expect(res.discountAmt).toBe(249)
  })

  it('대상 메뉴 없으면 명확한 거절 메시지', () => {
    const res = validatePosCouponCandidate(
      snowTemplate,
      {
        ...ctx(),
        subtotal: 249,
        cartLines: [{ menuId: '9', quantity: 1, lineSubtotal: 249 }],
      },
      { code: 'SNOW249' }
    )
    expect(res.valid).toBe(false)
    expect(res.message).toBe('장바구니에 쿠폰 대상 메뉴가 없습니다.')
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

describe('ensureAppliedCouponsInDiscountReason', () => {
  it('appends coupon reason when empty', () => {
    expect(
      ensureAppliedCouponsInDiscountReason('', [{ code: 'CMHBDCOUPON', quantity: 1 }])
    ).toBe('쿠폰: CMHBDCOUPON')
  })

  it('appends quantity and skips codes already present', () => {
    expect(
      ensureAppliedCouponsInDiscountReason('VIP', [
        { code: 'SAVE10', quantity: 2 },
        { code: 'VIP', quantity: 1 },
      ])
    ).toBe('VIP · 쿠폰: SAVE10×2')
  })

  it('uses legacy coupon code when applied list is empty', () => {
    expect(ensureAppliedCouponsInDiscountReason('', [], 'WELCOME10')).toBe('쿠폰: WELCOME10')
  })
})
