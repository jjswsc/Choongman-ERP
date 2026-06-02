import { describe, expect, it } from 'vitest'
import {
  buildKitchenSlipGroups,
  kitchenRoutingItemFromOrderItem,
  resolveEffectiveKitchenRouteForMenu,
  type KitchenSlipRoutingItem,
} from '@/lib/pos-kitchen-slip-routing'

const labels = {
  unified: 'Kitchen',
  kitchen1: 'K1',
  kitchen2: 'K2',
  kitchen3: 'K3',
}

function baseOpts(
  overrides: Partial<{
    kitchenPrinterByMenuId: Record<string, 0 | 1 | 2 | 3>
    kitchenRouteByMenu: Record<string, 0 | 1 | 2 | 3>
    kitchenRouteByCategory: Record<string, 0 | 1 | 2 | 3>
    kitchenRouteByCategoryMain: Record<string, 0 | 1 | 2 | 3>
    categoryByMenuId: Record<string, string>
    categoryMainByMenuId: Record<string, string>
  }> = {}
) {
  return {
    kitchenMode: 1,
    kitchen2Categories: [] as string[],
    kitchen3Categories: [] as string[],
    categoryByMenuId: { midChurro: 'Dessert', ...(overrides.categoryByMenuId || {}) },
    categoryMainByMenuId: { midChurro: 'Food', ...(overrides.categoryMainByMenuId || {}) },
    kitchenPrinterByMenuId: { midChurro: 0 as const, midChicken: 1 as const },
    menuNameByMenuId: { midChurro: 'CHURRO', midChicken: 'Chicken' },
    menuCodeByMenuId: { midChurro: 'S001', midChicken: 'C001' },
    labels,
    ...overrides,
  }
}

describe('buildKitchenSlipGroups printer overlay', () => {
  it('kitchenRouteByMenu overrides pos_menus kitchen_printer 0 so item prints', () => {
    const items: KitchenSlipRoutingItem[] = [
      { id: 'line-1', name: 'CHURRO', qty: 1, menuId: 'midChurro' },
      { id: 'line-2', name: 'Chicken', qty: 1, menuId: 'midChicken' },
    ]
    const slips = buildKitchenSlipGroups(items, {
      ...baseOpts({ kitchenRouteByMenu: { midChurro: 1 } }),
    })
    expect(slips).toHaveLength(1)
    expect(slips[0].items.map((x) => x.name)).toEqual(
      expect.arrayContaining(['[S001] CHURRO', '[C001] Chicken'])
    )
  })

  it('kitchenRouteByCategory overrides kp when menu map silent', () => {
    const items: KitchenSlipRoutingItem[] = [{ id: 'line-1', name: 'CHURRO', qty: 1, menuId: 'midChurro' }]
    const slips = buildKitchenSlipGroups(items, {
      ...baseOpts({
        kitchenRouteByCategory: { Dessert: 1 },
      }),
    })
    expect(slips[0].items).toHaveLength(1)
  })

  it('kitchenRouteByMenu 0 still excludes even if kpMap is 1', () => {
    const items: KitchenSlipRoutingItem[] = [{ id: 'line-1', name: 'CHURRO', qty: 1, menuId: 'midChurro' }]
    const slips = buildKitchenSlipGroups(items, {
      ...baseOpts({
        kitchenPrinterByMenuId: { midChurro: 1 },
        kitchenRouteByMenu: { midChurro: 0 },
      }),
    })
    expect(slips).toHaveLength(0)
  })

  it('routes by menu code when order menuId differs from printer settings id', () => {
    const items: KitchenSlipRoutingItem[] = [
      {
        id: 'line-1',
        name: 'Spicy Yangnyeom Chicken Dosirak',
        qty: 1,
        menuId: 'order-row-id',
      },
    ]
    const slips = buildKitchenSlipGroups(items, {
      ...baseOpts({
        kitchenMode: 2,
        kitchenPrinterByMenuId: { 'order-row-id': 2, 'settings-row-id': 2 },
        kitchenRouteByMenu: { 'settings-row-id': 1 },
        menuCodeByMenuId: { 'order-row-id': 'k032', 'settings-row-id': 'k032' },
        categoryByMenuId: { 'order-row-id': 'Dosirak', 'settings-row-id': 'Dosirak' },
      }),
      kitchenRouteByMenuCode: { k032: 1 },
    })
    expect(slips).toHaveLength(1)
    expect(slips[0].station).toBe(1)
  })

  it('resolveEffectiveKitchenRouteForMenu uses kitchen_printer when route map empty', () => {
    const route = resolveEffectiveKitchenRouteForMenu(
      { id: 'm1', code: 'K032', category: 'Dosirak', kitchenPrinter: 2 },
      {
        kitchenRouteByMenu: {},
        categoryByMenuId: { m1: 'Dosirak' },
        menuCodeByMenuId: { m1: 'K032' },
      }
    )
    expect(route).toBe(2)
  })

  it('expands promo lines with menuName snapshot when catalog id missing', () => {
    const items: KitchenSlipRoutingItem[] = [
      {
        id: 'promo-1',
        name: 'Festival Set',
        qty: 1,
        promoItems: [{ menuId: '26', optionId: null, menuName: 'Crispy Chicken', quantity: 1 }],
      },
    ]
    const slips = buildKitchenSlipGroups(items, {
      ...baseOpts({ menuNameByMenuId: {} }),
    })
    expect(slips[0]?.items[0]?.name).toBe('[Festival Set] Crispy Chicken')
    expect((slips[0]?.items[0] as { kitchenPromoGroupId?: string }).kitchenPromoGroupId).toBe(
      'promo-1'
    )
  })

  it('routes promo components by parent menu printer when parent menuId exists', () => {
    const items: KitchenSlipRoutingItem[] = [
      {
        id: 'promo-2',
        name: 'Festival Set',
        qty: 1,
        menuId: 'setMenu',
        promoItems: [{ menuId: 'childMenu', optionId: null, menuName: 'Crispy Chicken', quantity: 1 }],
      },
    ]
    const slips = buildKitchenSlipGroups(items, {
      ...baseOpts({
        kitchenMode: 2,
        kitchenPrinterByMenuId: { setMenu: 1, childMenu: 2 },
        menuNameByMenuId: { setMenu: 'Festival Set', childMenu: 'Crispy Chicken' },
        menuCodeByMenuId: { setMenu: 'S100', childMenu: 'C024' },
      }),
    })
    expect(slips).toHaveLength(1)
    expect(slips[0]?.station).toBe(1)
    expect(slips[0]?.items[0]?.name).toContain('Crispy Chicken')
  })

  it('adds optionCode as note token for kitchen print line', () => {
    const row = kitchenRoutingItemFromOrderItem(
      {
        id: 'line-1',
        name: 'Banban Chicken',
        quantity: 1,
        price: 259,
        optionCode1: 'C011-1',
      },
      'Banban Chicken'
    )
    expect(String(row.note ?? '')).toContain('optc:C011-1')
  })
})
