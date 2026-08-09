import { describe, expect, it } from 'vitest'
import {
  assemblePosMenuCostIndexEntries,
  costIndexKey,
} from '@/lib/pos-menu-cost-index-server'

describe('assemblePosMenuCostIndexEntries', () => {
  it('대체형: 옵션 전용 BOM이 있으면 그 값, 없으면 기본 BOM', () => {
    const ingredientPartsByKey = new Map([
      [costIndexKey(10, null), { food: 80, packaging: 5 }],
      [costIndexKey(10, 1), { food: 90, packaging: 5 }],
    ])
    const out = assemblePosMenuCostIndexEntries({
      ingredientPartsByKey,
      options: [
        {
          id: 1,
          menuId: 10,
          optionType: 'substitution',
          itemCode: null,
          additiveSourceMenuId: null,
          quantity: 1,
        },
        {
          id: 2,
          menuId: 10,
          optionType: 'substitution',
          itemCode: null,
          additiveSourceMenuId: null,
          quantity: 1,
        },
      ],
    })
    expect(out.get(costIndexKey(10, null))?.foodCost).toBe(80)
    expect(out.get(costIndexKey(10, 1))?.foodCost).toBe(90)
    // 옵션 전용 BOM 없으면 키 미등록 → lookup 시 baseFallback
    expect(out.get(costIndexKey(10, 2))).toBeUndefined()
    expect(out.get(costIndexKey(10, 1))?.costDelivery).toBe(95)
  })

  it('가산형: 기본 + 소스 메뉴 BOM×quantity (구 인덱스는 기본만 써서 과소)', () => {
    const ingredientPartsByKey = new Map([
      [costIndexKey(10, null), { food: 80, packaging: 5 }],
      [costIndexKey(20, null), { food: 15, packaging: 0 }],
    ])
    const out = assemblePosMenuCostIndexEntries({
      ingredientPartsByKey,
      options: [
        {
          id: 3,
          menuId: 10,
          optionType: 'additive',
          itemCode: null,
          additiveSourceMenuId: 20,
          quantity: 2,
        },
      ],
    })
    // 80 + 15*2 = 110 food, 5 pack
    expect(out.get(costIndexKey(10, 3))?.foodCost).toBe(110)
    expect(out.get(costIndexKey(10, 3))?.packagingCost).toBe(5)
    expect(out.get(costIndexKey(10, 3))?.costDelivery).toBe(115)
    // 구 로직(옵션 키 없음 → 기본 폴백)이면 80만 — 회귀 방지
    expect(out.get(costIndexKey(10, 3))?.foodCost).toBeGreaterThan(80)
  })

  it('가산형: item_code 가산 + 옵션 전용 BOM', () => {
    const ingredientPartsByKey = new Map([
      [costIndexKey(10, null), { food: 50, packaging: 0 }],
      [costIndexKey(10, 4), { food: 3, packaging: 1 }],
    ])
    const out = assemblePosMenuCostIndexEntries({
      ingredientPartsByKey,
      options: [
        {
          id: 4,
          menuId: 10,
          optionType: 'additive',
          itemCode: 'SIDE-A',
          additiveSourceMenuId: null,
          quantity: 2,
        },
      ],
      itemFoodCostByCode: { 'SIDE-A': 7 },
    })
    // 50 + 7*2 + 3 = 67 food, 1 pack
    expect(out.get(costIndexKey(10, 4))?.foodCost).toBe(67)
    expect(out.get(costIndexKey(10, 4))?.packagingCost).toBe(1)
  })

  it('sauce 코드가 itemLookup에 있으면 재료 줄에 원가가 잡힌다 (목록과 동일 전제)', () => {
    // assemble 단계는 parts 합만 — sauce 주입은 buildPosMenuCostIndex에서 수행.
    // 여기서는 sauce 단가가 이미 parts에 반영된 키를 검증.
    const ingredientPartsByKey = new Map([
      [costIndexKey(29, null), { food: 41.7, packaging: 10.4 }],
    ])
    const out = assemblePosMenuCostIndexEntries({
      ingredientPartsByKey,
      options: [],
    })
    expect(out.get(costIndexKey(29, null))?.foodCost).toBe(41.7)
    expect(out.get(costIndexKey(29, null))?.costHall).toBe(41.7)
  })

  it('가산형: source null BOM 비어 있으면 소스 메뉴 base entry 폴백', () => {
    const ingredientPartsByKey = new Map([
      [costIndexKey(10, null), { food: 40, packaging: 0 }],
      // source 20: null BOM 없음, 옵션 전용만 1건
      [costIndexKey(20, 99), { food: 12, packaging: 0 }],
    ])
    const out = assemblePosMenuCostIndexEntries({
      ingredientPartsByKey,
      options: [
        {
          id: 5,
          menuId: 10,
          optionType: 'additive',
          itemCode: null,
          additiveSourceMenuId: 20,
          quantity: 1,
        },
      ],
    })
    // 40 + 12(source fallback) = 52
    expect(out.get(costIndexKey(10, 5))?.foodCost).toBe(52)
  })
})
