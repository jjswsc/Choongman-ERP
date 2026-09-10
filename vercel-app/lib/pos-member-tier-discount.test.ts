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

  it('프로모 %가 걸린 접시는 등급에서 빼고 나머지 접시는 등급 대상이다', () => {
    const policy = {
      ...DEFAULT_MEMBER_TIER_DISCOUNT_POLICY,
      scopeMainCategories: ['Chicken'],
    }
    const subtotal = computeMemberTierDiscountEligibleSubtotal({
      lines: [{ id: 'katsu', menuId: 'm1', price: 199, quantity: 2 }],
      menuById,
      policy,
      lineDiscountModeByItemId: { 'katsu::u0': 'discount' },
      lineDiscountPctByItemId: { 'katsu::u0': 5 },
      fallbackPct: 5,
    })
    expect(subtotal).toBe(199)
  })

  it('한 메뉴만 프로모 할인이면 그 메뉴만 빼고 나머지 메뉴는 등급 대상이다', () => {
    const policy = {
      ...DEFAULT_MEMBER_TIER_DISCOUNT_POLICY,
      scopeMainCategories: ['Chicken'],
    }
    const subtotal = computeMemberTierDiscountEligibleSubtotal({
      lines: [
        { id: 'banban', menuId: 'm1', price: 259, quantity: 1 },
        { id: 'snow', menuId: 'm1', price: 199, quantity: 1 },
      ],
      menuById,
      policy,
      lineDiscountModeByItemId: { banban: 'discount' },
      lineDiscountPctByItemId: { banban: 5 },
      fallbackPct: 5,
    })
    expect(subtotal).toBe(199)
  })

  it('메뉴를 고르지 않고 주문 전체에 직접 할인을 걸면 등급 대상이 없다', () => {
    const policy = {
      ...DEFAULT_MEMBER_TIER_DISCOUNT_POLICY,
      scopeMainCategories: ['Chicken'],
    }
    const subtotal = computeMemberTierDiscountEligibleSubtotal({
      lines: [
        { id: 'banban', menuId: 'm1', price: 259, quantity: 1 },
        { id: 'snow', menuId: 'm1', price: 199, quantity: 1 },
      ],
      menuById,
      policy,
      wholeOrderManualDiscount: true,
    })
    expect(subtotal).toBe(0)
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
