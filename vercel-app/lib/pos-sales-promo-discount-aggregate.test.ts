import { describe, expect, it } from 'vitest'
import {
  aggregatePosSalesPromoBundleDiscount,
  filterPromoSalesRows,
  orderTypeToPromoRegularPriceChannel,
  type PromoPricingCatalog,
} from '@/lib/pos-sales-promo-discount-aggregate'

function catalogFixture(): PromoPricingCatalog {
  return {
    menus: [
      { id: '1', price: 200, priceDelivery: 220 },
      { id: '2', price: 100, priceDelivery: 110 },
    ],
    optionsByMenuId: {},
    promoMetaById: new Map([['9', { code: 'SET-9', name: 'Festival Set' }]]),
    promoItemsByPromoId: new Map([
      [
        '9',
        [
          { menuId: '1', quantity: 1 },
          { menuId: '2', quantity: 1 },
        ],
      ],
    ]),
  }
}

describe('aggregatePosSalesPromoBundleDiscount', () => {
  it('computes bundle discount from promoItems on the order line', () => {
    const result = aggregatePosSalesPromoBundleDiscount({
      catalog: catalogFixture(),
      orderRows: [
        {
          order_type: 'dine_in',
          items_json: JSON.stringify([
            {
              name: 'Festival Set',
              promoId: '9',
              promoCode: 'SET-9',
              price: 250,
              qty: 2,
              promoItems: [
                { menuId: '1', quantity: 1 },
                { menuId: '2', quantity: 1 },
              ],
            },
          ]),
        },
      ],
    })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.qty).toBe(2)
    expect(result.rows[0]?.regularAmount).toBe(600)
    expect(result.rows[0]?.saleAmount).toBe(500)
    expect(result.rows[0]?.bundleDiscount).toBe(100)
    expect(result.totals.bundleDiscount).toBe(100)
    expect(result.rows[0]?.estimatedLineQty).toBe(0)
  })

  it('falls back to pos_promo_items when promoItems missing on line', () => {
    const result = aggregatePosSalesPromoBundleDiscount({
      catalog: catalogFixture(),
      orderRows: [
        {
          order_type: 'takeout',
          items_json: JSON.stringify([
            {
              name: 'Festival Set',
              promoId: '9',
              price: 250,
              quantity: 1,
            },
          ]),
        },
      ],
    })

    expect(result.rows[0]?.regularAmount).toBe(300)
    expect(result.rows[0]?.bundleDiscount).toBe(50)
    expect(result.rows[0]?.estimatedLineQty).toBe(1)
  })

  it('uses delivery channel prices for delivery orders', () => {
    const result = aggregatePosSalesPromoBundleDiscount({
      catalog: catalogFixture(),
      orderRows: [
        {
          order_type: 'delivery',
          items_json: JSON.stringify([
            {
              promoId: '9',
              price: 250,
              qty: 1,
              promoItems: [
                { menuId: '1', quantity: 1 },
                { menuId: '2', quantity: 1 },
              ],
            },
          ]),
        },
      ],
    })

    expect(result.rows[0]?.regularAmount).toBe(330)
    expect(result.rows[0]?.bundleDiscount).toBe(80)
  })

  it('prefers promoRegularPrice snapshot over catalog', () => {
    const result = aggregatePosSalesPromoBundleDiscount({
      catalog: catalogFixture(),
      orderRows: [
        {
          items_json: JSON.stringify([
            {
              promoId: '9',
              price: 250,
              qty: 1,
              promoRegularPrice: 999,
              promoItems: [
                { menuId: '1', quantity: 1 },
                { menuId: '2', quantity: 1 },
              ],
            },
          ]),
        },
      ],
    })

    expect(result.rows[0]?.regularAmount).toBe(999)
    expect(result.rows[0]?.bundleDiscount).toBe(749)
    expect(result.rows[0]?.estimatedLineQty).toBe(0)
  })

  it('sums payment discount separately from bundle discount', () => {
    const result = aggregatePosSalesPromoBundleDiscount({
      catalog: catalogFixture(),
      orderRows: [
        {
          discount_amt: 40,
          coupon_discount_amt: 10,
          items_json: JSON.stringify([
            {
              promoId: '9',
              price: 250,
              qty: 1,
              promoItems: [
                { menuId: '1', quantity: 1 },
                { menuId: '2', quantity: 1 },
              ],
            },
          ]),
        },
      ],
    })

    expect(result.totals.paymentDiscount).toBe(40)
    expect(result.totals.bundleDiscount).toBe(50)
    expect(result.totals.totalDiscount).toBe(90)
  })
})

describe('orderTypeToPromoRegularPriceChannel', () => {
  it('maps delivery to delivery channel', () => {
    expect(orderTypeToPromoRegularPriceChannel('delivery')).toBe('delivery')
    expect(orderTypeToPromoRegularPriceChannel('dine_in')).toBe('hall')
  })
})

describe('filterPromoSalesRows', () => {
  it('filters by promo name tokens', () => {
    const rows = filterPromoSalesRows(
      [
        {
          key: 'a',
          promoId: '1',
          promoCode: 'A',
          name: 'Alpha Set',
          qty: 1,
          saleAmount: 1,
          regularAmount: 2,
          bundleDiscount: 1,
          discountPct: 50,
          estimatedLineQty: 0,
          unresolvedLineQty: 0,
        },
      ],
      ['alpha'],
      false
    )
    expect(rows).toHaveLength(1)
  })
})
