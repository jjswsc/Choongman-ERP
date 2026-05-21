import { describe, expect, it } from 'vitest'
import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'
import { emptyMarketingCollabDetail } from '@/lib/marketing-collab-detail'
import {
  allocateDiscountExcludingDrinksAndPromos,
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
