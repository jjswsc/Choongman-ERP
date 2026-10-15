import { describe, expect, it } from 'vitest'
import { getItemBomUnitLabel, getItemBomUnitsPerStockUnit, getItemCostPerUnit } from '@/lib/item-cost-util'

describe('getItemBomUnitsPerStockUnit', () => {
  it('재고 1박스 × BOM 단가 = 박스 단가 (kg·g·packaging·환산 없음)', () => {
    const cases = [
      { item: { price: 1572, total_quantity: 12, unit: 'kg' }, packaging: false },
      { item: { price: 950, total_quantity: 25000, unit: 'g' }, packaging: false },
      { item: { price: 1655, total_quantity: 800, unit: 'ea' }, packaging: true },
      { item: { price: 310, total_quantity: 24, unit: 'can' }, packaging: false },
      { item: { cost: 45, price: undefined, total_quantity: null, unit: 'ea' }, packaging: false },
    ]
    for (const { item, packaging } of cases) {
      const perStock = getItemBomUnitsPerStockUnit(item, packaging)
      const unitCost = getItemCostPerUnit(item, packaging)
      expect(perStock * unitCost).toBeCloseTo(Number(item.price ?? item.cost), 6)
    }
  })

  it('kg 품목 12kg 박스 = 12000g', () => {
    expect(getItemBomUnitsPerStockUnit({ price: 1572, total_quantity: 12, unit: 'kg' }, false)).toBe(12000)
    expect(getItemBomUnitLabel('kg', false)).toBe('g')
    expect(getItemBomUnitLabel('L', false)).toBe('ml')
    expect(getItemBomUnitLabel('ea', true)).toBe('ea')
  })
})
