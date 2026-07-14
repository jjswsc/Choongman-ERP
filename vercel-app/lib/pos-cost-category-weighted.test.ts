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

    const { rows } = aggregatePosCostWeightedByCategory({
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

  it('allocates set sales by catalog regular-price weight', () => {
    const costIndex = new Map([
      ['10|', { costHall: 70, costDelivery: 70, foodCost: 70, packagingCost: 0 }],
      ['20|', { costHall: 10, costDelivery: 10, foodCost: 10, packagingCost: 0 }],
    ])
    const menus = [
      { id: '10', name: '치킨', category_main: 'Chicken' },
      { id: '20', name: '사이드', category_main: 'Side' },
    ]
    const catalog = {
      menus: [
        { id: '10', name: '치킨', price: 200 },
        { id: '20', name: '사이드', price: 50 },
      ],
      optionsByMenuId: {},
      promoMetaById: new Map([['p1', { code: 'SET', name: '세트', kind: 'set' as const }]]),
      promoItemsByPromoId: new Map([
        [
          'p1',
          [
            { menuId: '10', quantity: 1 },
            { menuId: '20', quantity: 1 },
          ],
        ],
      ]),
      promoIdByMirrorMenuId: new Map<string, string>(),
    }
    const orderRows = [
      {
        order_type: 'dine_in',
        items_json: JSON.stringify([
          {
            promoId: 'p1',
            name: '세트',
            price: 200,
            quantity: 1,
          },
        ]),
      },
    ]

    const { rows } = aggregatePosCostWeightedByCategory({
      orderRows,
      menus,
      costIndex,
      catalog,
      miseRatePercent: 0,
    })

    const chicken = rows.find((r) => r.categoryMain === 'Chicken')
    const side = rows.find((r) => r.categoryMain === 'Side')
    // 200 판매가 → 정가 비중 200:50 = 4:1 → 160 / 40
    expect(chicken?.netSales).toBe(160)
    expect(side?.netSales).toBe(40)
    expect(chicken?.totalCost).toBe(70)
    expect(side?.totalCost).toBe(10)
    expect(chicken?.costPctOfNet).toBe(43.75)
    expect(side?.costPctOfNet).toBe(25)
  })

  it('excludes unmatched BOM lines from category sales/cost totals', () => {
    const costIndex = new Map([
      ['10|', { costHall: 30, costDelivery: 30, foodCost: 30, packagingCost: 0 }],
    ])
    const menus = [
      { id: '10', name: '치킨', category_main: 'Chicken' },
      { id: '99', name: '미등록', category_main: 'Side' },
    ]
    const orderRows = [
      {
        order_type: 'dine_in',
        items_json: JSON.stringify([
          { menuId: '10', price: 100, quantity: 1 },
          { menuId: '99', price: 50, quantity: 1 },
        ]),
      },
    ]

    const { rows, meta } = aggregatePosCostWeightedByCategory({
      orderRows,
      menus,
      costIndex,
      miseRatePercent: 0,
    })

    expect(meta.excludedUnmatchedSales).toBe(50)
    expect(meta.excludedUnmatchedQty).toBe(1)
    const chicken = rows.find((r) => r.categoryMain === 'Chicken')
    const side = rows.find((r) => r.categoryMain === 'Side')
    expect(chicken?.netSales).toBe(100)
    expect(chicken?.totalCost).toBe(30)
    expect(side).toBeUndefined()
  })

  it('applies residual payment discount and service_amt to category sales', () => {
    const costIndex = new Map([
      ['10|', { costHall: 40, costDelivery: 40, foodCost: 40, packagingCost: 0 }],
    ])
    const menus = [{ id: '10', name: '치킨', category_main: 'Chicken' }]
    const orderRows = [
      {
        order_type: 'dine_in',
        discount_amt: 20,
        service_amt: 10,
        items_json: JSON.stringify([{ menuId: '10', price: 100, quantity: 1 }]),
      },
    ]

    const { rows, meta } = aggregatePosCostWeightedByCategory({
      orderRows,
      menus,
      costIndex,
      miseRatePercent: 0,
    })

    expect(meta.paymentDiscountAllocated).toBe(20)
    expect(meta.serviceAmtAllocated).toBe(10)
    expect(rows[0]?.netSales).toBe(70)
    expect(rows[0]?.totalCost).toBe(40)
    expect(rows[0]?.costPctOfNet).toBe(57.14)
  })

  it('does not double-count lineDiscountAmt already in line net sales', () => {
    const costIndex = new Map([
      ['10|', { costHall: 40, costDelivery: 40, foodCost: 40, packagingCost: 0 }],
    ])
    const menus = [{ id: '10', name: '치킨', category_main: 'Chicken' }]
    const orderRows = [
      {
        order_type: 'dine_in',
        discount_amt: 30,
        items_json: JSON.stringify([{ menuId: '10', price: 100, quantity: 1, lineDiscountAmt: 30 }]),
      },
    ]

    const { rows, meta } = aggregatePosCostWeightedByCategory({
      orderRows,
      menus,
      costIndex,
      miseRatePercent: 0,
    })

    expect(meta.paymentDiscountAllocated).toBe(0)
    expect(rows[0]?.netSales).toBe(70)
    expect(rows[0]?.costPctOfNet).toBe(57.14)
  })
})
