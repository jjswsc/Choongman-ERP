import { describe, expect, it } from 'vitest'
import { enrichPosOrderLikeItemsWithPromoSnapshot } from '@/lib/pos-payment-receipt-from-order'

describe('enrichPosOrderLikeItemsWithPromoSnapshot promo detection', () => {
  it('does not treat regular menu code as promo', () => {
    const promoCatalogById = new Map<string, any>([
      [
        '11',
        {
          id: '11',
          code: 'SET1',
          name: 'Set 1',
          items: [{ menuId: '74', optionId: null, quantity: 1 }],
        },
      ],
    ])
    const rows = enrichPosOrderLikeItemsWithPromoSnapshot(
      [{ id: 'grab:item-24-c024', name: 'C024', qty: 1, price: 259 }] as any[],
      { promoCatalogById, menus: [] }
    )
    expect(Array.isArray((rows[0] as any).promoItems)).toBe(false)
  })

  it('resolves promo by explicit promo code token', () => {
    const promoCatalogById = new Map<string, any>([
      [
        '11',
        {
          id: '11',
          code: 'SET1',
          name: 'Set 1',
          items: [{ menuId: '74', optionId: null, quantity: 1 }],
        },
      ],
    ])
    const rows = enrichPosOrderLikeItemsWithPromoSnapshot(
      [{ id: 'grab:line-1', name: 'SET1', qty: 1, price: 111 }] as any[],
      { promoCatalogById, menus: [] }
    )
    expect(Array.isArray((rows[0] as any).promoItems)).toBe(true)
    expect((rows[0] as any).promoItems?.[0]?.menuId).toBe('74')
  })
})
