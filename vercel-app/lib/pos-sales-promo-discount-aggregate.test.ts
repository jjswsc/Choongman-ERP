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
    promoMetaById: new Map([
      [
        '9',
        { code: 'SET-9', name: 'Festival Set', kind: 'set' },
      ],
      [
        '10',
        {
          code: 'CAMP-S01',
          name: 'Campaign Set',
          marketingCampaignId: '5',
          kind: 'campaign',
        },
      ],
    ]),
    promoItemsByPromoId: new Map([
      [
        '9',
        [
          { menuId: '1', quantity: 1 },
          { menuId: '2', quantity: 1 },
        ],
      ],
      [
        '10',
        [
          { menuId: '1', quantity: 1 },
          { menuId: '2', quantity: 1 },
        ],
      ],
    ]),
    promoIdByMirrorMenuId: new Map(),
  }
}

describe('aggregatePosSalesPromoBundleDiscount', () => {
  it('computes bundle discount from promoItems on the order line', () => {
    const result = aggregatePosSalesPromoBundleDiscount({
      catalog: catalogFixture(),
      orderRows: [
        {
          total: 1200,
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
    expect(result.rows[0]?.kind).toBe('set')
    expect(result.rows[0]?.qty).toBe(2)
    expect(result.rows[0]?.regularAmount).toBe(600)
    expect(result.rows[0]?.saleAmount).toBe(500)
    expect(result.rows[0]?.bundleDiscount).toBe(100)
    expect(result.totals.bundleDiscount).toBe(100)
    expect(result.totals.periodGrossSales).toBe(1200)
    expect(result.totals.bundleDiscountPctOfGross).toBeCloseTo(8.33, 1)
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
          total: 500,
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
    expect(result.totals.totalDiscountPctOfGross).toBe(18)
  })

  it('splits bundle discount by set vs campaign kind', () => {
    const result = aggregatePosSalesPromoBundleDiscount({
      catalog: catalogFixture(),
      orderRows: [
        {
          total: 1000,
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
            {
              promoId: '10',
              price: 240,
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

    expect(result.byKind).toHaveLength(2)
    const setKind = result.byKind.find((k) => k.kind === 'set')
    const campaignKind = result.byKind.find((k) => k.kind === 'campaign')
    expect(setKind?.bundleDiscount).toBe(50)
    expect(campaignKind?.bundleDiscount).toBe(60)
    expect(result.totals.promoLineSaleSharePct).toBe(49)
  })

  it('aggregates delivery platform promo under bundle platform kind', () => {
    const result = aggregatePosSalesPromoBundleDiscount({
      catalog: catalogFixture(),
      orderRows: [
        {
          total: 500,
          order_type: 'delivery',
          delivery_app_code: 'grab',
          discount_amt: 80,
          items_json: JSON.stringify([
            {
              name: 'Festival Set',
              promoId: '9',
              promoCode: 'SET-9',
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

    const platformRow = result.rows.find((r) => r.kind === 'platform')
    expect(platformRow?.bundleDiscount).toBe(80)
    expect(platformRow?.name).toContain('Festival Set')
    expect(platformRow?.promoCode).toBe('SET-9')
    expect(platformRow?.qty).toBe(1)
    expect(platformRow?.saleAmount).toBe(250)
    expect(platformRow?.regularAmount).toBe(330)
    expect(result.totals.bundleDiscount).toBe(80)
    expect(result.totals.saleAmount).toBe(250)
    expect(result.totals.qty).toBe(1)
    expect(result.totals.paymentDiscount).toBe(0)
    expect(result.byKind.find((k) => k.kind === 'platform')?.bundleDiscount).toBe(80)
    expect(result.byKind.find((k) => k.kind === 'platform')?.saleAmount).toBe(250)
  })

  it('splits a platform order across promo menus and keeps discount total', () => {
    const result = aggregatePosSalesPromoBundleDiscount({
      catalog: catalogFixture(),
      orderRows: [
        {
          total: 800,
          order_type: 'delivery',
          delivery_app_code: 'grab',
          discount_amt: 90,
          items_json: JSON.stringify([
            {
              name: 'Festival Set',
              promoId: '9',
              promoCode: 'SET-9',
              price: 250,
              qty: 1,
              promoItems: [
                { menuId: '1', quantity: 1 },
                { menuId: '2', quantity: 1 },
              ],
            },
            {
              name: 'Campaign Set',
              promoId: '10',
              promoCode: 'CAMP-S01',
              price: 240,
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

    const platformRows = result.rows.filter((r) => r.kind === 'platform')
    expect(platformRows).toHaveLength(2)
    expect(platformRows.some((r) => r.name.includes('Festival Set'))).toBe(true)
    expect(platformRows.some((r) => r.name.includes('Campaign Set'))).toBe(true)
    expect(Math.round(platformRows.reduce((s, r) => s + r.bundleDiscount, 0) * 100) / 100).toBe(90)
    expect(result.totals.bundleDiscount).toBe(90)
    expect(result.totals.qty).toBe(2)
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
          kind: 'set',
          qty: 1,
          saleAmount: 1,
          regularAmount: 2,
          bundleDiscount: 1,
          discountPct: 50,
          discountPctOfGross: 1,
          saleSharePctOfGross: 2,
          bundleDiscountSharePct: 100,
          estimatedLineQty: 0,
          unresolvedLineQty: 0,
        },
      ],
      ['alpha'],
      false
    )
    expect(rows).toHaveLength(1)
  })

  it('matches Korean aliases for platform rows', () => {
    const rows = filterPromoSalesRows(
      [
        {
          key: 'platform::grab::promo::9',
          promoId: '9',
          promoCode: 'SET-9',
          name: 'Grab · Festival Set',
          kind: 'platform',
          qty: 1,
          saleAmount: 250,
          regularAmount: 330,
          bundleDiscount: 80,
          discountPct: 24,
          discountPctOfGross: 1,
          saleSharePctOfGross: 2,
          bundleDiscountSharePct: 100,
          estimatedLineQty: 0,
          unresolvedLineQty: 0,
        },
      ],
      ['그랩'],
      false
    )
    expect(rows).toHaveLength(1)
  })
})
