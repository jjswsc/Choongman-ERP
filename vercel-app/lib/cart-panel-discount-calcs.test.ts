import { describe, expect, it } from 'vitest'
import type { OrderItem } from '@/lib/pos-types'
import type { PosAppliedCoupon } from '@/lib/api-client'
import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'
import { DEFAULT_MEMBER_TIER_DISCOUNT_POLICY } from '@/lib/member-tier-discount-policy'
import {
  buildCartPanelPaymentDiscountReason,
  computeCartPanelCollabDiscountAmt,
  computeCartPanelLineDiscountSnapshot,
  computeCartPanelTierDiscountAmt,
} from '@/lib/cart-panel-discount-calcs'

const cartItems: OrderItem[] = [
  { id: 'A', name: 'A', price: 100, quantity: 2 },
  { id: 'B', name: 'B', price: 50, quantity: 1 },
]

describe('cart-panel-discount-calcs', () => {
  it('협업 캠페인 미적용이면 협업 할인 0', () => {
    expect(
      computeCartPanelCollabDiscountAmt({
        appliedCollab: null,
        menuByIdForCollab: new Map(),
        lineDiscountModeByItemId: {},
        lineDiscountPctByItemId: {},
        discountType: 'percent',
        discountValue: 0,
        splitCollabJoinByPerson: [],
        splitCount: 1,
        cartItems,
        hasSelectedDiscountScope: false,
        menuSplitAssigned: {},
        showSplit: false,
        splitMode: 'amount',
        collabQuantity: 1,
      })
    ).toBe(0)
  })

  it('회원 미선택이거나 등급 할인율 0이면 등급 할인 0', () => {
    const base = {
      selectedMemberId: '',
      selectedMemberTierDiscountRate: 0.05,
      cartItems,
      menuByIdForCollab: new Map(),
      tierDiscountPolicy: DEFAULT_MEMBER_TIER_DISCOUNT_POLICY,
      lineDiscountModeByItemId: {},
      lineDiscountPctByItemId: {},
      discountType: 'percent' as const,
      discountValue: 0,
      hasSelectedDiscountScope: false,
      manualDiscountAmt: 0,
      appliedCollab: null,
      appliedCoupons: [],
      orderType: 'dine-in' as const,
    }
    expect(computeCartPanelTierDiscountAmt(base)).toBe(0)
    expect(computeCartPanelTierDiscountAmt({ ...base, selectedMemberId: 'm1', selectedMemberTierDiscountRate: 0 })).toBe(0)
  })

  it('전체 할인이 없으면 줄 할인 스냅샷은 줄 수만큼 0', () => {
    expect(
      computeCartPanelLineDiscountSnapshot({
        discount: 0,
        cartItems,
        menuByIdForCollab: new Map(),
        lineDiscountModeByItemId: {},
        hasSelectedDiscountScope: false,
        appliedCollab: null,
        collabDiscountAmt: 0,
        serviceDiscountAmt: 0,
        cancelledLineAmt: 0,
        tierDiscountAmt: 0,
        manualDiscountAmt: 0,
        couponLineAlloc: [],
        manualLineAlloc: undefined,
      })
    ).toEqual([0, 0])
  })

  describe('buildCartPanelPaymentDiscountReason', () => {
    const t = (k: string) => ({ posCollabDiscount: '협업', posCouponDiscountReason: '쿠폰: {code}' })[k] ?? k
    const tr = (_key: string, fallback: string) => fallback
    const base = {
      discountReason: '',
      appliedCollab: null,
      t,
      collabQuantity: 1,
      tierDiscountAmt: 0,
      tr,
      memberMap: {},
      selectedMemberId: '',
      selectedMemberTierDiscountRate: 0,
      appliedCoupons: [] as PosAppliedCoupon[],
      cartItems,
      lineDiscountModeByItemId: {},
      selectedCancelledLineCount: 0,
    }

    it('할인 없으면 빈 문자열', () => {
      expect(buildCartPanelPaymentDiscountReason(base)).toBe('')
    })

    it('직접 사유 · 쿠폰 · 등급 · 취소 순서로 잇는다', () => {
      expect(
        buildCartPanelPaymentDiscountReason({
          ...base,
          discountReason: ' VIP ',
          appliedCoupons: [{ code: 'abc', quantity: 2 }] as PosAppliedCoupon[],
          tierDiscountAmt: 10,
          memberMap: {
            m1: { id: 1, memberNo: 'M1', name: 'Somchai', phone: '', email: '', tierCode: 'gold' },
          },
          selectedMemberId: 'm1',
          selectedMemberTierDiscountRate: 0.05,
          selectedCancelledLineCount: 1,
        })
      ).toBe('VIP · 쿠폰: ABC×2 · 등급 할인 (GOLD 5.0%) · 취소처리 1건')
    })

    it('협업 캠페인 이름 표시', () => {
      expect(
        buildCartPanelPaymentDiscountReason({
          ...base,
          appliedCollab: { id: 'c1', topic: 'Summer', collabDetail: {} as MarketingCollabDetail },
        })
      ).toContain('협업: Summer')
    })
  })
})
