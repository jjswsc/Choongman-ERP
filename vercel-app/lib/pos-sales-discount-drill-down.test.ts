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
  it('filters by payment kind platform', () => {
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
          discount_reason: '',
        },
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
      filter: { kind: 'platform' },
    })
    expect(orders).toHaveLength(1)
    expect(orders[0]?.orderId).toBe(1)
    expect(orders[0]?.discountAmount).toBe(23)
    expect(orders[0]?.discountReason).toBe('Grab platform promo')
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
  it('returns empty when no promo lines', () => {
    const orders = collectPosSalesPromoBundleDrillOrders({
      orderRows: [{ id: 1, items_json: '[]', total: 100 }],
      catalog: emptyCatalog,
      filter: { kind: 'set' },
    })
    expect(orders).toHaveLength(0)
  })
})
