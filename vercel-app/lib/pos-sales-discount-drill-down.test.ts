import { describe, expect, it } from 'vitest'
import {
  collectPosSalesPaymentDiscountDrillOrders,
  collectPosSalesPromoBundleDrillOrders,
} from '@/lib/pos-sales-discount-drill-down'
import type { PromoPricingCatalog } from '@/lib/pos-order-promo-regular-price'

const emptyCatalog: PromoPricingCatalog = {
  menus: [],
  optionsByMenuId: {},
  promoMetaById: new Map(),
  promoItemsByPromoId: new Map(),
  promoIdByMirrorMenuId: new Map(),
}

describe('collectPosSalesPaymentDiscountDrillOrders', () => {
  it('filters bundle platform delivery orders', () => {
    const orders = collectPosSalesPaymentDiscountDrillOrders({
      orderRows: [
        {
          id: 1,
          order_no: 'A-1',
          store_code: 'CM01',
          order_type: 'delivery',
          delivery_app_code: 'grab',
          total: 106,
          discount_amt: 23,
          discount_reason: 'Grab platform promo',
        },
      ],
      filter: { kind: 'platform' },
    })
    expect(orders).toHaveLength(0)
  })

  it('filters payment kind manual for hall discount', () => {
    const orders = collectPosSalesPaymentDiscountDrillOrders({
      orderRows: [
        {
          id: 2,
          order_no: 'A-2',
          store_code: 'CM01',
          order_type: 'dine_in',
          total: 900,
          discount_amt: 100,
          discount_reason: 'VIP',
        },
      ],
      filter: { kind: 'manual' },
    })
    expect(orders).toHaveLength(1)
    expect(orders[0]?.orderId).toBe(2)
    expect(orders[0]?.discountAmount).toBe(100)
  })

  it('filters by payment row key', () => {
    const orders = collectPosSalesPaymentDiscountDrillOrders({
      orderRows: [
        {
          id: 2,
          order_no: 'A-2',
          total: 900,
          discount_amt: 100,
          discount_reason: 'VIP',
        },
      ],
      filter: { kind: 'manual', rowKey: 'manual::vip' },
    })
    expect(orders).toHaveLength(1)
    expect(orders[0]?.discountAmount).toBe(100)
  })
})

describe('collectPosSalesPromoBundleDrillOrders', () => {
  it('includes delivery platform orders under platform kind', () => {
    const orders = collectPosSalesPromoBundleDrillOrders({
      orderRows: [
        {
          id: 1,
          order_no: 'A-1',
          store_code: 'CM01',
          order_type: 'delivery',
          delivery_app_code: 'grab',
          total: 106,
          discount_amt: 23,
          discount_reason: 'Grab platform promo',
        },
      ],
      catalog: emptyCatalog,
      filter: { kind: 'platform' },
    })
    expect(orders).toHaveLength(1)
    expect(orders[0]?.discountAmount).toBe(23)
  })

  it('filters platform drill by promo line key and shows menu label', () => {
    const catalog: PromoPricingCatalog = {
      ...emptyCatalog,
      promoMetaById: new Map([
        ['9', { code: 'SET-9', name: 'Festival Set', kind: 'set' }],
      ]),
      promoItemsByPromoId: new Map([['9', [{ menuId: '1', quantity: 1 }]]]),
      menus: [{ id: '1', price: 200, priceDelivery: 220 }],
    }
    const orderRows = [
      {
        id: 1,
        order_no: 'A-1',
        store_code: 'CM01',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        total: 250,
        discount_amt: 80,
        items_json: JSON.stringify([
          {
            name: 'Festival Set',
            promoId: '9',
            promoCode: 'SET-9',
            price: 250,
            qty: 1,
            promoItems: [{ menuId: '1', quantity: 1 }],
          },
        ]),
      },
    ]
    const matched = collectPosSalesPromoBundleDrillOrders({
      orderRows,
      catalog,
      filter: { kind: 'platform', promoKey: 'platform::grab::promo::9' },
    })
    expect(matched).toHaveLength(1)
    expect(matched[0]?.discountAmount).toBe(80)
    expect(matched[0]?.promoLabel).toContain('Festival Set')

    const missed = collectPosSalesPromoBundleDrillOrders({
      orderRows,
      catalog,
      filter: { kind: 'platform', promoKey: 'platform::grab::promo::99' },
    })
    expect(missed).toHaveLength(0)
  })

  it('returns empty when no promo lines', () => {
    const orders = collectPosSalesPromoBundleDrillOrders({
      orderRows: [{ id: 1, items_json: '[]', total: 100 }],
      catalog: emptyCatalog,
      filter: { kind: 'set' },
    })
    expect(orders).toHaveLength(0)
  })
})
