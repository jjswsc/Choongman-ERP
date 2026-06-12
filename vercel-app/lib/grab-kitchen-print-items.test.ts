import { describe, expect, it } from 'vitest'
import { buildGrabPosCatalog } from '@/lib/grab-pos-order-enrich'
import { mergeGrabOrderItemsForKitchenPrint } from '@/lib/grab-kitchen-print-items'

describe('mergeGrabOrderItemsForKitchenPrint', () => {
  it('merges set children and drops grabSetChild rows (kitchen = receipt path)', () => {
    const catalog = buildGrabPosCatalog(
      [
        { id: 24, name: 'Banban Chicken', code: 'C024', isBanban: true },
        { id: 11, name: 'GOLDEN FRIED CHICKEN', code: 'C011' },
      ],
      [
        { name: 'L - Boneless', optionCode: 'C011-5' },
        { name: 'SNOW ONION', optionCode: 'C024-F1' },
        { name: 'RED HOT CHICKEN', optionCode: 'C024-F2' },
      ],
      [{ id: '9', name: '[[Festival] Set 2]', code: 'SET2', items: [] }]
    )
    const items = mergeGrabOrderItemsForKitchenPrint(
      [
        {
          id: 'p1',
          name: 'Festival Set 2',
          price: 399,
          qty: 1,
          promoId: '9',
          promoItems: [
            { menuId: '24', menuName: 'Banban Chicken', optionId: null, quantity: 1 },
            { menuId: '11', menuName: 'GOLDEN FRIED CHICKEN', optionId: null, quantity: 1 },
          ],
        },
        {
          id: 'c1',
          name: '[[Festival] Set 2] Banban Chicken (SNOW ONION / RED HOT CHICKEN)',
          price: 0,
          qty: 1,
          menuId1: '24',
          note: 'banbanFlavors:SNOW ONION,RED HOT CHICKEN',
          grabSetChild: true,
        },
        {
          id: 'c2',
          name: '[[Festival] Set 2] GOLDEN FRIED CHICKEN (L - Boneless)',
          price: 0,
          qty: 1,
          menuId1: '11',
          note: 'optc:C011-5',
          grabSetChild: true,
        },
      ],
      catalog
    )
    expect(items).toHaveLength(1)
    expect(items[0].promoItems?.length).toBeGreaterThanOrEqual(2)
    const banban = items[0].promoItems?.find((p) => p.menuName === 'Banban Chicken')
    const gfc = items[0].promoItems?.find((p) => p.menuName === 'GOLDEN FRIED CHICKEN')
    expect(banban?.optionName).toMatch(/snow onion/i)
    expect(banban?.optionName).toMatch(/red hot/i)
    expect(gfc?.optionName).toMatch(/l/i)
    expect(gfc?.optionName).toMatch(/boneless/i)
  })

  it('passes through non-set orders unchanged', () => {
    const catalog = buildGrabPosCatalog([], [], [])
    const base = [
      {
        id: '1',
        name: 'Banban Chicken',
        price: 279,
        qty: 1,
        note: 'banbanFlavors:SNOW ONION,RED HOT CHICKEN',
      },
    ]
    expect(mergeGrabOrderItemsForKitchenPrint(base, catalog)).toEqual(base)
  })
})
