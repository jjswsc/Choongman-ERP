import { describe, expect, it } from 'vitest'
import {
  buildCheckoutPaymentReceiptModalData,
  enrichPosOrderLikeItemsWithPromoSnapshot,
  mergePartialPromoSnapshotWithCatalog,
} from '@/lib/pos-payment-receipt-from-order'
import type { PosPromoWithItems } from '@/lib/api-client'

describe('buildCheckoutPaymentReceiptModalData', () => {
  it('includes coupon line discounts in summary discount and total', () => {
    const receipt = buildCheckoutPaymentReceiptModalData({
      orderNo: 'ST01-TEST',
      storeCode: 'ST01',
      orderType: 'dine_in',
      tableName: '2',
      items: [
        { id: '1', name: 'GOLDEN FRIED CHICKEN', price: 219, quantity: 1, lineDiscountAmt: 172.06 },
        { id: '2', name: 'Banban Chicken', price: 259, quantity: 1, lineDiscountAmt: 50.94 },
      ],
      discountAmt: 94,
      couponDiscountAmt: 0,
      appliedCoupons: [
        { code: 'CPN1', name: 'Coupon 1', discountAmt: 172.06, quantity: 1 },
        { code: 'CPN2', name: 'Coupon 2', discountAmt: 50.94, quantity: 1 },
      ],
      paymentSum: 255,
      adjustments: {},
    })

    expect(receipt.discountAmt).toBe(223)
    expect(receipt.total).toBe(255)
    expect(receipt.appliedCoupons).toHaveLength(2)
    expect(receipt.items?.[0]?.lineDiscountAmt).toBe(172.06)
  })
})

describe('mergePartialPromoSnapshotWithCatalog', () => {
  it('fills missing set components from catalog when snapshot is partial', () => {
    const snapshot = [{ menuId: '1', optionId: null, quantity: 1, menuName: 'Rice' }]
    const catalog = [
      { menuId: '1', optionId: null, quantity: 1, menuName: 'Rice' },
      { menuId: '2', optionId: '3', quantity: 1, menuName: 'CURRY Bar.B.Q FRIED CHICKEN', optionName: 'S Boneless' },
      { menuId: '4', optionId: null, quantity: 1, menuName: 'KIMCHI SOUP With Rice' },
    ]
    expect(mergePartialPromoSnapshotWithCatalog(snapshot, catalog)).toHaveLength(3)
  })
})

describe('enrichPosOrderLikeItemsWithPromoSnapshot partial set', () => {
  it('merges partial promoItems with catalog template for receipt print', () => {
    const promoCatalogById = new Map<string, PosPromoWithItems>([
      [
        '99',
        {
          id: '99',
          code: 'SET3',
          name: '[Super Deal] Set 3',
          items: [
            { menuId: '1', optionId: null, quantity: 1, menuName: 'Rice' },
            { menuId: '2', optionId: '3', quantity: 1, menuName: 'CURRY Bar.B.Q FRIED CHICKEN' },
            { menuId: '4', optionId: null, quantity: 1, menuName: 'KIMCHI SOUP With Rice' },
          ],
        } as PosPromoWithItems,
      ],
    ])
    const enriched = enrichPosOrderLikeItemsWithPromoSnapshot(
      [
        {
          id: 'set-line',
          name: '[Super Deal] Set 3',
          promoId: '99',
          promoItems: [{ menuId: '1', optionId: null, quantity: 1, menuName: 'Rice' }],
        },
      ],
      { promoCatalogById, menus: [] }
    )
    expect((enriched[0] as { promoItems?: unknown[] }).promoItems).toHaveLength(3)
  })
})
