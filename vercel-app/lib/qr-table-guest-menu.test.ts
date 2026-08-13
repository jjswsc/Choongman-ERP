import { describe, expect, it } from 'vitest'
import { aggregateQrGuestSentLines, splitQrGuestMenusByTier } from '@/lib/qr-table-guest-menu'

describe('aggregateQrGuestSentLines', () => {
  it('sums qty for the same name and skips cancelled', () => {
    const rows = aggregateQrGuestSentLines([
      { name: 'Beef', qty: 1, price: 0, buffetIncluded: true },
      { name: 'Beef', quantity: 2, price: 0, buffetIncluded: true },
      { name: 'Coke', qty: 1, price: 40, buffetIncluded: false },
      { name: 'Coke', qty: 1, price: 40, buffetIncluded: false, cancelled: true },
    ])
    expect(rows).toEqual([
      { name: 'Beef', qty: 3, price: 0, buffetIncluded: true },
      { name: 'Coke', qty: 1, price: 40, buffetIncluded: false },
    ])
  })
})

describe('splitQrGuestMenusByTier', () => {
  const menus = [{ menuId: 1 }, { menuId: 2 }, { menuId: 3 }]

  it('puts non-included menus on extras when extra allowlist is empty', () => {
    const r = splitQrGuestMenusByTier({ menus, includedIds: [1], extraIds: [] })
    expect(r.included.map((m) => m.menuId)).toEqual([1])
    expect(r.extras.map((m) => m.menuId)).toEqual([2, 3])
  })

  it('limits extras to the allowlist for 299/399/499 packages', () => {
    const r = splitQrGuestMenusByTier({ menus, includedIds: [1], extraIds: [3] })
    expect(r.included.map((m) => m.menuId)).toEqual([1])
    expect(r.extras.map((m) => m.menuId)).toEqual([3])
  })
})
