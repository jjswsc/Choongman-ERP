import { describe, expect, it } from 'vitest'
import type { PromoPricingCatalog } from '@/lib/pos-order-promo-regular-price'
import {
  collectDeliveryPlatformPromoLineShares,
  extraPlatformPromoSearchHaystack,
} from '@/lib/pos-sales-platform-promo-lines'

function catalogFixture(): PromoPricingCatalog {
  return {
    menus: [
      { id: '1', price: 200, priceDelivery: 220 },
      { id: '2', price: 100, priceDelivery: 110 },
    ],
    optionsByMenuId: {},
    promoMetaById: new Map([
      ['9', { code: 'SET-9', name: 'Festival Set', kind: 'set' }],
      ['10', { code: 'CAMP-S01', name: 'Campaign Set', marketingCampaignId: '5', kind: 'campaign' }],
    ]),
    promoItemsByPromoId: new Map([
      ['9', [{ menuId: '1', quantity: 1 }, { menuId: '2', quantity: 1 }]],
      ['10', [{ menuId: '1', quantity: 1 }, { menuId: '2', quantity: 1 }]],
    ]),
    promoIdByMirrorMenuId: new Map([['99', '9']]),
  }
}

describe('collectDeliveryPlatformPromoLineShares', () => {
  it('keeps a residual platform row when items_json is empty', () => {
    const result = collectDeliveryPlatformPromoLineShares({
      catalog: catalogFixture(),
      order: {
        order_type: 'delivery',
        delivery_app_code: 'grab',
        discount_amt: 23,
        discount_reason: 'Grab platform promo',
      },
    })
    expect(result.discountAmt).toBe(23)
    expect(result.lines).toHaveLength(0)
    expect(result.platformKey).toBe('platform::grab')
  })

  it('splits two promo lines and allocates the order discount', () => {
    const result = collectDeliveryPlatformPromoLineShares({
      catalog: catalogFixture(),
      order: {
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
    })
    expect(result.lines).toHaveLength(2)
    expect(result.lines.every((l) => l.key.startsWith('platform::grab::promo::'))).toBe(true)
    expect(Math.round(result.lines.reduce((s, l) => s + l.allocatedDiscount, 0) * 100) / 100).toBe(90)
    expect(result.lines.find((l) => l.promoId === '9')?.saleAmount).toBe(250)
    expect(result.lines.find((l) => l.promoId === '9')?.regularAmount).toBe(330)
  })

  it('falls back to menu names when promoId is missing', () => {
    const result = collectDeliveryPlatformPromoLineShares({
      catalog: catalogFixture(),
      order: {
        order_type: 'delivery',
        delivery_app_code: 'shopee',
        discount_amt: 40,
        items_json: JSON.stringify([
          { name: 'Soy Sauce Chicken', menuId: '1', price: 180, qty: 2 },
        ]),
      },
    })
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]?.key).toBe('platform::shopee::menuId:1')
    expect(result.lines[0]?.name).toContain('Soy Sauce Chicken')
    expect(result.lines[0]?.saleAmount).toBe(360)
    expect(result.lines[0]?.regularAmount).toBe(440)
    expect(result.lines[0]?.allocatedDiscount).toBe(40)
  })
})

describe('extraPlatformPromoSearchHaystack', () => {
  it('adds Korean aliases for Grab rows', () => {
    const hay = extraPlatformPromoSearchHaystack({
      key: 'platform::grab::promo::9',
      name: 'Grab · Festival Set',
      promoCode: 'SET-9',
    })
    expect(hay).toContain('그랩')
  })
})
