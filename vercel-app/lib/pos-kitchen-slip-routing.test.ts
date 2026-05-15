import { describe, expect, it } from 'vitest'
import { buildKitchenSlipGroups, type KitchenSlipRoutingItem } from '@/lib/pos-kitchen-slip-routing'

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
})
