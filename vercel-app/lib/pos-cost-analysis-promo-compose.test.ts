import { describe, expect, it } from 'vitest'
import { applyPromoMirrorCostsFromItems } from '@/lib/pos-cost-analysis-promo-compose'

describe('applyPromoMirrorCostsFromItems', () => {
  it('잔여 BOM이 있어도 세트 구성 원가로 덮어쓴다', () => {
    const rows = [
      { menuId: '10', optionId: null, costHall: 40, costDelivery: 45, breakdown: [{ itemCode: 'LEFTOVER' }] },
      { menuId: '20', optionId: null, costHall: 321.3, costDelivery: 398.3, breakdown: [{ itemCode: 'COPIED' }] },
    ]
    applyPromoMirrorCostsFromItems({
      rows,
      menusById: { 20: { promo_id: 7 } },
      promoItemsByPromoId: {
        7: [{ promo_id: 7, menu_id: 10, quantity: 1 }],
      },
    })
    expect(rows[1]!.costHall).toBe(40)
    expect(rows[1]!.costDelivery).toBe(45)
    expect(rows[1]!.costFromPromoItems).toBe(true)
    expect(rows[1]!.breakdown).toEqual([])
  })

  it('선택 그룹 pick 1은 원가 상위 1개만 합산한다 (프로모션 세트 조회와 동일)', () => {
    const rows = [
      { menuId: '1', optionId: null, costHall: 40.2, costDelivery: 50 },
      { menuId: '2', optionId: null, costHall: 87.2, costDelivery: 99 },
      { menuId: '3', optionId: null, costHall: 42, costDelivery: 52 },
      { menuId: '9', optionId: null, costHall: 21.7, costDelivery: 25 },
      { menuId: '100', optionId: null, costHall: 0, costDelivery: 0 },
    ]
    applyPromoMirrorCostsFromItems({
      rows,
      menusById: { 100: { promo_id: 3 } },
      promoItemsByPromoId: {
        3: [
          { promo_id: 3, menu_id: 1, quantity: 1, choice_group: 'chicken', choice_pick_count: 1 },
          { promo_id: 3, menu_id: 2, quantity: 1, choice_group: 'chicken', choice_pick_count: 1 },
          { promo_id: 3, menu_id: 3, quantity: 1, choice_group: 'chicken', choice_pick_count: 1 },
          { promo_id: 3, menu_id: 9, quantity: 1 },
        ],
      },
    })
    const set = rows[4]!
    expect(set.costHall).toBe(108.9)
    expect(set.costDelivery).toBe(124)
    expect(set.costFromPromoItems).toBe(true)
  })

  it('구성 메뉴 옵션 원가를 쓴다', () => {
    const rows = [
      { menuId: '10', optionId: null, costHall: 30, costDelivery: 35 },
      { menuId: '10', optionId: '55', costHall: 48, costDelivery: 58 },
      { menuId: '200', optionId: null, costHall: 999, costDelivery: 999 },
    ]
    applyPromoMirrorCostsFromItems({
      rows,
      menusById: { 200: { promo_id: 8 } },
      promoItemsByPromoId: {
        8: [{ promo_id: 8, menu_id: 10, option_id: 55, quantity: 2 }],
      },
    })
    expect(rows[2]!.costHall).toBe(96)
    expect(rows[2]!.costDelivery).toBe(116)
  })
})
