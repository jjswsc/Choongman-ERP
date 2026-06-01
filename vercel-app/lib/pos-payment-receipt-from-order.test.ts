import { describe, expect, it } from 'vitest'
import type { PosPromoWithItems } from '@/lib/api-client'
import {
  enrichPosOrderLikeItemsWithPromoSnapshot,
  enrichPromoSnapshotForPrint,
} from '@/lib/pos-payment-receipt-from-order'

type OrderLikeRow = Record<string, unknown> & {
  id: string
  name: string
  qty: number
  price: number
  promoItems?: unknown[]
}

describe('enrichPosOrderLikeItemsWithPromoSnapshot promo detection', () => {
  const promoCatalogById = new Map<string, PosPromoWithItems>([
    [
      '11',
      {
        id: '11',
        code: 'SET1',
        name: 'Set 1',
        items: [{ menuId: '74', optionId: null, quantity: 1 }],
      } as PosPromoWithItems,
    ],
  ])

  it('does not treat regular menu code as promo', () => {
    const rows = enrichPosOrderLikeItemsWithPromoSnapshot<OrderLikeRow>(
      [{ id: 'grab:item-24-c024', name: 'C024', qty: 1, price: 259 }],
      { promoCatalogById, menus: [] }
    )
    expect(Array.isArray(rows[0].promoItems)).toBe(false)
  })

  it('resolves promo by explicit promo code token', () => {
    const rows = enrichPosOrderLikeItemsWithPromoSnapshot<OrderLikeRow>(
      [{ id: 'grab:line-1', name: 'SET1', qty: 1, price: 111 }],
      { promoCatalogById, menus: [] }
    )
    expect(Array.isArray(rows[0].promoItems)).toBe(true)
    expect(rows[0].promoItems?.[0]).toMatchObject({ menuId: '74' })
  })

  it('resolves promo by exact display name (e.g. PEPSI MEGA 3)', () => {
    const megaCatalog = new Map<string, PosPromoWithItems>([
      [
        '93',
        {
          id: '93',
          code: '260457-S03',
          name: 'PEPSI MEGA 3',
          items: [
            { menuId: '10', optionId: '1', quantity: 1 },
            { menuId: '11', optionId: '2', quantity: 1 },
          ],
        } as PosPromoWithItems,
      ],
    ])
    const rows = enrichPosOrderLikeItemsWithPromoSnapshot<OrderLikeRow>(
      [{ id: 'grab:line-mega3', name: 'PEPSI MEGA 3', qty: 1, price: 368 }],
      { promoCatalogById: megaCatalog, menus: [] }
    )
    expect(Array.isArray(rows[0].promoItems)).toBe(true)
    expect(rows[0].promoItems?.length).toBe(2)
  })

  it('resolves promo by numeric bundle code token', () => {
    const numericCatalog = new Map<string, PosPromoWithItems>([
      [
        '91',
        {
          id: '91',
          code: '260457-S01',
          name: 'PEPSI MEGA 1',
          items: [{ menuId: '74', optionId: null, quantity: 1 }],
        } as PosPromoWithItems,
      ],
    ])
    const rows = enrichPosOrderLikeItemsWithPromoSnapshot<OrderLikeRow>(
      [{ id: 'grab:260457-S01', name: 'PEPSI MEGA 1', qty: 1, price: 306 }],
      { promoCatalogById: numericCatalog, menus: [] }
    )
    expect(Array.isArray(rows[0].promoItems)).toBe(true)
    expect(rows[0].promoItems?.[0]).toMatchObject({ menuId: '74' })
  })
})

describe('enrichPromoSnapshotForPrint', () => {
  it('preserves optionName from order snapshot and resolves menuName from menus', () => {
    const rows = enrichPromoSnapshotForPrint(
      [{ menuId: '10', optionId: '5', optionName: 'M - Drumette', quantity: 1 }],
      {
        menus: [{ id: '10', name: 'Golden Fried Chicken' } as never],
        optionNameById: new Map([['5', 'M - Drumette (fallback)']]),
      }
    )
    expect(rows?.[0]).toMatchObject({
      menuId: '10',
      menuName: 'Golden Fried Chicken',
      optionName: 'M - Drumette',
    })
  })
})
