import { describe, expect, it } from 'vitest'
import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'
import { emptyMarketingCollabDetail } from '@/lib/marketing-collab-detail'
import {
  allocateDiscountExcludingDrinksAndPromos,
  buildCartPanelLineDiscountAllocations,
  collabDiscountAmountForCart,
  collabLineDiscountAllocations,
  isCartLineEligibleForCollabDiscount,
  isCollabDiscountReasonText,
  isDrinkMenu,
  isPromotionMenu,
} from './pos-collab-discount'

function detail(partial: Partial<MarketingCollabDetail>): MarketingCollabDetail {
  return { ...emptyMarketingCollabDetail(), ...partial }
}

const menuById = new Map([
  [
    '10',
    {
      id: '10',
      name: 'Banban Chicken',
      code: 'C001',
      categoryMain: 'Chicken',
      category: 'Banban',
    },
  ],
  [
    '20',
    {
      id: '20',
      name: 'CHANG 630 ML.',
      code: 'D001',
      categoryMain: 'Drinks',
      category: 'DRINKS',
    },
  ],
  [
    '30',
    {
      id: '30',
      name: 'Choongman Festival Set 3',
      code: 'P003',
      categoryMain: 'Promotion',
      category: 'Set',
    },
  ],
  [
    '5',
    {
      id: '5',
      name: 'Legacy Chicken',
      code: 'C005',
      categoryMain: 'Chicken',
      category: 'ORIGINAL',
    },
  ],
  [
    '8',
    {
      id: '8',
      name: 'SNOW ONION',
      code: 'C008',
      categoryMain: 'Chicken',
      category: 'SNOW',
    },
  ],
  [
    '9',
    {
      id: '9',
      name: 'GARLIC Bar.B.Q FRIED CHICKEN',
      code: 'C010',
      categoryMain: 'Chicken',
      category: 'Bar.B.Q',
    },
  ],
])

describe('pos-collab-discount exclusions', () => {
  const chickenOnly = detail({
    posDiscountType: 'percent',
    posDiscountValue: 12,
    scopeMainCategories: ['Chicken', 'Korean'],
  })

  it('프로모션 세트 줄은 대상에서 제외한다', () => {
    const line = { id: 'promo-99-base', name: 'Choongman Festival Set 3', price: 333, qty: 1, promoId: '99' }
    expect(isCartLineEligibleForCollabDiscount(line, menuById, chickenOnly)).toBe(false)
  })

  it('음료 메뉴는 Drinks 대분류가 범위에 없으면 제외한다', () => {
    const line = { id: '20', name: 'CHANG 630 ML.', price: 140, qty: 1, menuId: '20' }
    expect(isCartLineEligibleForCollabDiscount(line, menuById, chickenOnly)).toBe(false)
    expect(isDrinkMenu(menuById.get('20')!)).toBe(true)
  })

  it('치킨 일반 메뉴는 범위에 포함된다', () => {
    const line = { id: '10', name: 'Banban Chicken', price: 239, qty: 1, menuId: '10' }
    expect(isCartLineEligibleForCollabDiscount(line, menuById, chickenOnly)).toBe(true)
  })

  it('GARLIC Bar.B.Q는 Chicken 범위 협업에 포함된다', () => {
    const amountCollab = detail({
      posDiscountType: 'amount',
      posDiscountValue: 100,
      scopeMainCategories: ['Chicken', 'Korean'],
    })
    const line = { id: '9-opt', name: 'GARLIC Bar.B.Q FRIED CHICKEN (M - Boneless)', price: 249, qty: 1, menuId: '9' }
    expect(isCartLineEligibleForCollabDiscount(line, menuById, chickenOnly)).toBe(true)
    expect(collabDiscountAmountForCart([line], menuById, amountCollab, 1)).toBe(100)
  })

  it('테이블 결제(cart-existing) 줄은 menuId 없어도 원본 id로 메뉴를 찾는다', () => {
    const amountCollab = detail({
      posDiscountType: 'amount',
      posDiscountValue: 100,
      scopeMainCategories: ['Chicken', 'Korean'],
    })
    const line = {
      id: 'cart-existing-0-9-boneless',
      name: 'GARLIC Bar.B.Q FRIED CHICKEN (M - Boneless)',
      price: 249,
      quantity: 1,
    }
    expect(isCartLineEligibleForCollabDiscount(line, menuById, chickenOnly)).toBe(true)
    expect(collabDiscountAmountForCart([line], menuById, amountCollab, 1)).toBe(100)
  })

  it('신규 장바구니(cart- 접두) 줄도 menuId 없이 메뉴를 찾는다', () => {
    const amountCollab = detail({
      posDiscountType: 'amount',
      posDiscountValue: 100,
      scopeMainCategories: ['Chicken', 'Korean'],
    })
    const line = {
      id: 'cart-9-uuid-suffix',
      name: 'GARLIC Bar.B.Q FRIED CHICKEN (M - Boneless)',
      price: 249,
      qty: 1,
    }
    expect(isCartLineEligibleForCollabDiscount(line, menuById, chickenOnly)).toBe(true)
    expect(collabDiscountAmountForCart([line], menuById, amountCollab, 1)).toBe(100)
  })

  it('promo- 접두 cart id가 다른 메뉴 id와 잘못 매칭되지 않는다', () => {
    const line = { id: 'promo-5-base', name: 'Choongman Festival Set 1', price: 111, qty: 1, promoId: '5' }
    expect(isCartLineEligibleForCollabDiscount(line, menuById, chickenOnly)).toBe(false)
  })

  it('범위 미설정 시에도 프로모·음료는 기본 제외하고 일반 메뉴만 할인한다', () => {
    const openScope = detail({ posDiscountType: 'percent', posDiscountValue: 12 })
    const lines = [
      { id: '10', name: 'Banban Chicken', price: 239, qty: 1, menuId: '10' },
      { id: 'promo-1-base', name: 'Choongman Festival Set 1', price: 111, qty: 1, promoId: '1' },
      { id: '20', name: 'CHANG 630 ML.', price: 140, qty: 1, menuId: '20' },
    ]
    expect(collabDiscountAmountForCart(lines, menuById, openScope)).toBe(Math.floor(239 * 0.12))
  })

  it('Promotion 대분류는 scope에 명시된 경우만 허용한다', () => {
    const withPromo = detail({
      posDiscountType: 'percent',
      posDiscountValue: 10,
      scopeMainCategories: ['Promotion'],
    })
    const line = { id: '30', name: 'Choongman Festival Set 3', price: 333, qty: 1, menuId: '30' }
    expect(isPromotionMenu(menuById.get('30')!)).toBe(true)
    expect(isCartLineEligibleForCollabDiscount(line, menuById, withPromo)).toBe(true)
  })

  it('테이블 결제 UUID 줄 id는 메뉴명으로 카탈로그 역매칭한다', () => {
    const percentCollab = detail({
      posDiscountType: 'percent',
      posDiscountValue: 5,
      scopeMainCategories: ['Chicken', 'Korean'],
    })
    const line = {
      id: 'cart-existing-0-550e8400-e29b-41d4-a716-446655440000',
      name: 'Banban Chicken (M - Boneless)',
      price: 330,
      quantity: 1,
    }
    expect(isCartLineEligibleForCollabDiscount(line, menuById, percentCollab)).toBe(true)
    expect(collabDiscountAmountForCart([line], menuById, percentCollab)).toBe(Math.floor(330 * 0.05))
  })

  it('대분류+하위+특정메뉴는 교집합 — SNOW·C008만 대상, Bar.B.Q 치킨은 제외', () => {
    const snowOnly = detail({
      posDiscountType: 'amount',
      posDiscountValue: 229,
      scopeMainCategories: ['Chicken'],
      scopeCategoryKeys: ['Chicken::SNOW'],
      scopeMenuIds: ['8'],
    })
    const snowLine = { id: '8-opt', name: 'SNOW ONION (M)', price: 229, qty: 1, menuId: '8' }
    const garlicLine = { id: '9-opt', name: 'GARLIC Bar.B.Q', price: 229, qty: 1, menuId: '9' }
    expect(isCartLineEligibleForCollabDiscount(snowLine, menuById, snowOnly)).toBe(true)
    expect(isCartLineEligibleForCollabDiscount(garlicLine, menuById, snowOnly)).toBe(false)
    const lines = [snowLine, garlicLine]
    const total = collabDiscountAmountForCart(lines, menuById, snowOnly)
    expect(total).toBe(229)
    const alloc = collabLineDiscountAllocations(lines, menuById, snowOnly, total)
    expect(alloc[0]).toBe(229)
    expect(alloc[1]).toBe(0)
  })

  it('대분류 scope 비교는 대소문자를 무시한다', () => {
    const collab = detail({
      posDiscountType: 'percent',
      posDiscountValue: 10,
      scopeMainCategories: ['chicken'],
    })
    const line = { id: '10', name: 'Banban Chicken', price: 239, qty: 1, menuId: '10' }
    expect(isCartLineEligibleForCollabDiscount(line, menuById, collab)).toBe(true)
  })

  it('협업 할인 줄 배분은 대상 줄에만 표시한다', () => {
    const lines = [
      { id: '10', name: 'Banban Chicken', price: 239, qty: 1, menuId: '10' },
      { id: 'promo-1-base', name: 'Choongman Festival Set 1', price: 111, qty: 1, promoId: '1' },
      { id: '20', name: 'CHANG 630 ML.', price: 140, qty: 1, menuId: '20' },
    ]
    const total = collabDiscountAmountForCart(lines, menuById, chickenOnly)
    const alloc = collabLineDiscountAllocations(lines, menuById, chickenOnly, total)
    expect(alloc[0]).toBeGreaterThan(0)
    expect(alloc[1]).toBe(0)
    expect(alloc[2]).toBe(0)
    expect(alloc.reduce((s, v) => s + v, 0)).toBeCloseTo(total, 2)
  })

  it('저장된 줄 할인 합이 총액과 다르면(구 비율 배분) 음료 제외로 다시 배분한다', () => {
    const lines = [
      { name: 'Banban Chicken', price: 239, qty: 1, menuId: '10' },
      { name: 'CHANG 630 ML.', price: 140, qty: 1, menuId: '20' },
    ]
    const wrongSaved = [75.04, 43.96]
    const wrongSum = wrongSaved.reduce((s, v) => s + v, 0)
    expect(wrongSum).toBeCloseTo(119, 2)
    const fixed = allocateDiscountExcludingDrinksAndPromos(lines, 119, menuById)
    expect(fixed[0]).toBe(119)
    expect(fixed[1]).toBe(0)
  })

  it('영수증 폴백: 협업 할인 119는 치킨 줄에만 표시하고 음료는 0', () => {
    const lines = [
      { name: 'Banban Chicken', price: 239, qty: 1, menuId: '10' },
      { name: 'CHANG 630 ML.', price: 140, qty: 1, menuId: '20' },
    ]
    const alloc = allocateDiscountExcludingDrinksAndPromos(lines, 119, menuById)
    expect(alloc[0]).toBe(119)
    expect(alloc[1]).toBe(0)
    expect(isCollabDiscountReasonText('ส่วนลดความร่วมมือ: CM x Chang')).toBe(true)
  })
})

describe('buildCartPanelLineDiscountAllocations', () => {
  it('수동 할인(%)은 할인적용으로 선택한 줄에만 배분하고 음료 줄은 0', () => {
    const lines = [
      { id: 'a', name: 'Banban Chicken', price: 259, qty: 1, menuId: '10' },
      { id: 'b', name: 'Tteokbokki', price: 199, qty: 1, menuId: '11' },
      { id: 'c', name: 'Aquafina', price: 20, qty: 1, menuId: '20' },
      { id: 'd', name: 'Ice', price: 0, qty: 2 },
    ]
    const scopeSubtotal = 259 + 199
    const manualDiscount = Math.floor((scopeSubtotal * 20) / 100)
    expect(manualDiscount).toBe(91)
    const alloc = buildCartPanelLineDiscountAllocations({
      lines,
      menuById,
      lineModeById: { a: 'discount', b: 'discount', c: 'none', d: 'none' },
      hasSelectedDiscountScope: true,
      collabDetail: null,
      collabDiscountAmt: 0,
      serviceDiscountAmt: 0,
      cancelledLineAmt: 0,
      manualAndCouponDiscountAmt: manualDiscount,
    })
    expect(alloc[2]).toBe(0)
    expect(alloc[3]).toBe(0)
    expect(alloc.reduce((s, v) => s + v, 0)).toBeCloseTo(manualDiscount, 2)
    expect(alloc[0]).toBeGreaterThan(0)
    expect(alloc[1]).toBeGreaterThan(0)
  })

  it('쿠폰·등급·수동 할인을 분리 배분한다 (Snow 전용 쿠폰)', () => {
    const lines = [
      { id: 'a', name: 'SNOW ONION', price: 249, qty: 1, menuId: '8' },
      { id: 'b', name: 'GUCHUJANG', price: 249, qty: 1, menuId: '9' },
    ]
    const couponLineAlloc = [249, 0]
    const tierDiscount = 49.8
    const alloc = buildCartPanelLineDiscountAllocations({
      lines,
      menuById,
      lineModeById: {},
      hasSelectedDiscountScope: false,
      collabDetail: null,
      collabDiscountAmt: 0,
      serviceDiscountAmt: 0,
      cancelledLineAmt: 0,
      tierDiscountAmt: tierDiscount,
      manualDiscountAmt: 0,
      couponLineAlloc,
    })
    expect(alloc[0]).toBeCloseTo(249 + tierDiscount / 2, 1)
    expect(alloc[1]).toBeCloseTo(tierDiscount / 2, 1)
    expect(alloc.reduce((s, v) => s + v, 0)).toBeCloseTo(249 + tierDiscount, 1)
  })
})

describe('pos-collab-discount amount stacking', () => {
  const amountCollab = detail({
    posDiscountType: 'amount',
    posDiscountValue: 100,
    posMaxPerOrder: 10,
    posAllowQuantityEntry: true,
    scopeMainCategories: ['Chicken', 'Korean'],
  })

  it('정액 협업은 잔여 금액 기준으로 N회 적용한다 (500฿ 주문에 100฿×4)', () => {
    const lines = [{ id: '10', name: 'Banban Chicken', price: 500, qty: 1, menuId: '10' }]
    expect(collabDiscountAmountForCart(lines, menuById, amountCollab, 4)).toBe(400)
    expect(collabDiscountAmountForCart(lines, menuById, amountCollab, 5)).toBe(500)
    expect(collabDiscountAmountForCart(lines, menuById, amountCollab, 10)).toBe(500)
  })

  it('정률 협업은 수량 파라미터를 무시하고 1회만 적용한다', () => {
    const percentCollab = detail({
      posDiscountType: 'percent',
      posDiscountValue: 10,
      posMaxPerOrder: 10,
      posAllowQuantityEntry: true,
    })
    const lines = [{ id: '10', name: 'Banban Chicken', price: 500, qty: 1, menuId: '10' }]
    expect(collabDiscountAmountForCart(lines, menuById, percentCollab, 4)).toBe(50)
  })

  it('수량 입력이 꺼져 있으면 정액도 1회만 적용한다', () => {
    const singleOnly = detail({
      posDiscountType: 'amount',
      posDiscountValue: 100,
      posMaxPerOrder: 10,
      posAllowQuantityEntry: false,
    })
    const lines = [{ id: '10', name: 'Banban Chicken', price: 500, qty: 1, menuId: '10' }]
    expect(collabDiscountAmountForCart(lines, menuById, singleOnly, 4)).toBe(100)
  })
})
