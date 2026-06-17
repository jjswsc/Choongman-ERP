import { describe, expect, it } from 'vitest'
import {
  aggregatePromoChoiceAwareTotals,
  calcRegularPriceSum,
  calcRegularPriceSumWithChoices,
  countPromoChoiceEffectiveUnits,
} from '@/lib/promo-economics'

describe('promo choice-aware economics', () => {
  const menus = [
    { id: '1', price: 249 },
    { id: '2', price: 249 },
    { id: '3', price: 249 },
    { id: '4', price: 249 },
    { id: '5', price: 199 },
  ]
  const optionsByMenuId = {}

  it('같은 선택 그룹은 최대 정가 1개만 합산한다', () => {
    const items = [
      { menuId: '1', quantity: 1, choiceGroup: 'chicken', choicePickCount: 1 },
      { menuId: '2', quantity: 1, choiceGroup: 'chicken', choicePickCount: 1 },
      { menuId: '3', quantity: 1, choiceGroup: 'chicken', choicePickCount: 1 },
      { menuId: '4', quantity: 1, choiceGroup: 'chicken', choicePickCount: 1 },
      { menuId: '5', quantity: 1, choiceGroup: 'soup', choicePickCount: 1 },
    ]

    const naive = calcRegularPriceSum({ items, menus, optionsByMenuId })
    const aware = calcRegularPriceSumWithChoices({ items, menus, optionsByMenuId })

    expect(naive).toBe(249 * 4 + 199)
    expect(aware).toBe(249 + 199)
    expect(countPromoChoiceEffectiveUnits(items)).toBe(2)
  })

  it('같은 선택 그룹은 최대 원가 라인만 합산한다', () => {
    const lines = [
      { menuId: '1', quantity: 1, choiceGroup: 'chicken', choicePickCount: 1 },
      { menuId: '2', quantity: 1, choiceGroup: 'chicken', choicePickCount: 1 },
      { menuId: '3', quantity: 1, choiceGroup: 'chicken', choicePickCount: 1 },
      { menuId: '4', quantity: 1, choiceGroup: 'chicken', choicePickCount: 1 },
      { menuId: '5', quantity: 1, choiceGroup: 'soup', choicePickCount: 1 },
    ]
    const costByMenu: Record<string, number> = {
      '1': 40.2,
      '2': 45,
      '3': 87.2,
      '4': 42,
      '5': 41,
    }

    const total = aggregatePromoChoiceAwareTotals(lines, (ln) => (costByMenu[ln.menuId] ?? 0) * (ln.quantity ?? 1))

    expect(total).toBeCloseTo(87.2 + 41, 5)
  })

  it('pickCount가 2이면 상위 2개를 합산한다', () => {
    const lines = [
      { menuId: '1', quantity: 1, choiceGroup: 'drink', choicePickCount: 2 },
      { menuId: '2', quantity: 1, choiceGroup: 'drink', choicePickCount: 2 },
      { menuId: '3', quantity: 1, choiceGroup: 'drink', choicePickCount: 2 },
    ]
    const values: Record<string, number> = { '1': 10, '2': 30, '3': 20 }

    const total = aggregatePromoChoiceAwareTotals(lines, (ln) => values[ln.menuId] ?? 0)

    expect(total).toBe(50)
  })

  it('선택 그룹이 없으면 기존처럼 모두 합산한다', () => {
    const lines = [
      { menuId: '1', quantity: 1 },
      { menuId: '2', quantity: 2 },
    ]
    const values: Record<string, number> = { '1': 10, '2': 20 }

    const total = aggregatePromoChoiceAwareTotals(lines, (ln) => (values[ln.menuId] ?? 0) * (ln.quantity ?? 1))

    expect(total).toBe(50)
  })
})
