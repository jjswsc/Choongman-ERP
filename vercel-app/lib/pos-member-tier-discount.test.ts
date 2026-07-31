import { describe, expect, it } from 'vitest'
import { DEFAULT_MEMBER_TIER_DISCOUNT_POLICY } from '@/lib/member-tier-discount-policy'
import {
  computeMemberTierDiscountEligibleSubtotal,
  resolveMemberTierDiscountAmount,
} from '@/lib/pos-member-tier-discount'

describe('pos-member-tier-discount', () => {
  const menuById = new Map([
    [
      'm1',
      { id: 'm1', categoryMain: 'Chicken', category: 'SNOW', name: 'Snow', code: 'C001' },
    ],
    [
      'promo1',
      { id: 'promo1', categoryMain: 'Promotion', category: 'Set', name: 'Set A', code: 'P001' },
    ],
  ])

  it('excludes promo lines and applies scope', () => {
    const policy = {
      ...DEFAULT_MEMBER_TIER_DISCOUNT_POLICY,
      scopeMainCategories: ['Chicken'],
    }
    const subtotal = computeMemberTierDiscountEligibleSubtotal({
      lines: [
        { id: 'm1-1', menuId: 'm1', price: 100, quantity: 2 },
        { id: 'promo-promo1', promoId: 'x', price: 200, quantity: 1 },
      ],
      menuById,
      policy,
    })
    expect(subtotal).toBe(200)
  })

  it('blocks tier discount when collab is active and stacking disabled', () => {
    const amt = resolveMemberTierDiscountAmount({
      eligibleSubtotal: 1000,
      discountRate: 0.05,
      policy: DEFAULT_MEMBER_TIER_DISCOUNT_POLICY,
      hasCollab: true,
      hasCoupons: false,
    })
    expect(amt).toBe(0)
  })

  it('returns zero when scope is not configured', () => {
    const amt = resolveMemberTierDiscountAmount({
      eligibleSubtotal: 1000,
      discountRate: 0.05,
      policy: DEFAULT_MEMBER_TIER_DISCOUNT_POLICY,
      hasCollab: false,
      hasCoupons: false,
    })
    expect(amt).toBe(0)
  })

  it('blocks tier discount on delivery even when scope and rate allow it', () => {
    const policy = {
      ...DEFAULT_MEMBER_TIER_DISCOUNT_POLICY,
      scopeMainCategories: ['Chicken'],
    }
    const amt = resolveMemberTierDiscountAmount({
      eligibleSubtotal: 1000,
      discountRate: 0.05,
      policy,
      hasCollab: false,
      hasCoupons: false,
      orderType: 'delivery',
    })
    expect(amt).toBe(0)
  })
})
