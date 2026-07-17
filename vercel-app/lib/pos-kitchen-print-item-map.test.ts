import { describe, expect, it } from 'vitest'
import { mapDineInAddonCartLineForKitchenPrint, mapPosOrderRowForKitchenPrint } from '@/lib/pos-kitchen-print-item-map'

describe('mapPosOrderRowForKitchenPrint', () => {
  const menus = [
    { id: '24', name: 'Banban Chicken', code: 'C024', isBanban: true },
    { id: '6', name: 'GARLIC Bar.B.Q FRIED CHICKEN', code: 'C006' },
    { id: '12', name: 'SOY SAUCE Bar.B.Q FRIED CHICKEN', code: 'C012' },
  ]

  it('keeps banban parent menuId separate from flavor menuId1/menuId2', () => {
    const row = mapPosOrderRowForKitchenPrint(
      {
        id: 'grab:gf-763',
        name: 'Banban Chicken',
        price: 279,
        qty: 1,
        menuId: '24',
        menuId1: '6',
        menuId2: '12',
        note: 'mods:GARLIC Bar.B.Q FRIED CHICKEN,SOY SAUCE Bar.B.Q FRIED CHICKEN · banbanFlavors:GARLIC Bar.B.Q FRIED CHICKEN,SOY SAUCE Bar.B.Q FRIED CHICKEN',
      },
      { menus, deliveryAppCode: 'grab' }
    )
    expect(row.menuId).toBe('24')
    expect(row.menuId1).toBe('6')
    expect(row.menuId2).toBe('12')
    expect(row.name).toBe('Banban Chicken')
    expect(row.note).toMatch(/banbanFlavors:/i)
  })

  it('does not promote menuId1 to parent menuId when menuId is missing', () => {
    const row = mapPosOrderRowForKitchenPrint(
      {
        id: 'banban-6-12',
        name: 'Banban Chicken',
        qty: 1,
        menuId1: '6',
        menuId2: '12',
      },
      { menus }
    )
    expect(row.menuId).toBeUndefined()
    expect(row.menuId1).toBe('6')
    expect(row.menuId2).toBe('12')
  })
})

describe('mapDineInAddonCartLineForKitchenPrint', () => {
  const menus = [{ id: '24', name: 'Banban Chicken', code: 'C024', isBanban: true }]

  it('preserves banban parent and flavor ids from cart line', () => {
    const row = mapDineInAddonCartLineForKitchenPrint(
      {
        id: 'cart-banban-new',
        name: 'Banban Chicken',
        price: 259,
        quantity: 1,
        menuId: '24',
        menuId1: '6',
        menuId2: '12',
        note: 'banbanFlavors:GOLDEN FRIED CHICKEN,SPICY YANGNYEOM',
      },
      { menus }
    )
    expect(row.menuId).toBe('24')
    expect(row.menuId1).toBe('6')
    expect(row.menuId2).toBe('12')
    expect(row.qty).toBe(1)
  })
})
