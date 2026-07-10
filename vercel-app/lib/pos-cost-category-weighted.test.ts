import { describe, expect, it } from 'vitest'
import { aggregatePosCostWeightedByCategory } from '@/lib/pos-cost-category-weighted'

describe('aggregatePosCostWeightedByCategory', () => {
  it('weights cost and sales by category from order lines', () => {
    const costIndex = new Map([
      [
        '10|',
        { costHall: 30, costDelivery: 32, foodCost: 30, packagingCost: 2 },
      ],
      [
        '20|',
        { costHall: 50, costDelivery: 52, foodCost: 48, packagingCost: 2 },
      ],
    ])
    const menus = [
      { id: 10, name: '치킨', category_main: '치킨' },
      { id: 20, name: '음료', category_main: '음료' },
    ]
    const orderRows = [
      {
        order_type: 'dine_in',
        items_json: JSON.stringify([
          { menuId: 10, name: '치킨', price: 100, quantity: 2 },
          { menuId: 20, name: '음료', price: 50, quantity: 1 },
        ]),
      },
    ]

    const rows = aggregatePosCostWeightedByCategory({
      orderRows,
      menus,
      costIndex,
      miseRatePercent: 0,
    })

    const chicken = rows.find((r) => r.categoryMain === '치킨')
    const drink = rows.find((r) => r.categoryMain === '음료')
    expect(chicken?.netSales).toBe(200)
    expect(chicken?.totalCost).toBe(60)
    expect(chicken?.costPctOfNet).toBe(30)
    expect(drink?.netSales).toBe(50)
    expect(drink?.totalCost).toBe(48)
    expect(drink?.costPctOfNet).toBe(96)
  })
})
