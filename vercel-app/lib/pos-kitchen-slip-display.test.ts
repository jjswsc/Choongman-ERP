import { describe, expect, it } from 'vitest'
import {
  buildKitchenHallStyleSlipLines,
  parseKitchenSplitPromoLineName,
} from './pos-kitchen-slip-display'
import type { KitchenSlipRoutingItem } from './pos-kitchen-slip-routing'

describe('pos-kitchen-slip-display', () => {
  it('parseKitchenSplitPromoLineName handles menu code prefix', () => {
    const parsed = parseKitchenSplitPromoLineName('[C001] [Set 1] GOLDEN FRIED CHICKEN')
    expect(parsed).toEqual({
      codePrefix: '[C001] ',
      parentLabel: 'Set 1',
      childLabel: 'GOLDEN FRIED CHICKEN',
    })
  })

  it('groups split promo children under set header with full promoItems from order', () => {
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'set-1',
        name: '[April] Set 1',
        qty: 1,
        promoItems: [
          { menuId: 'rice', menuName: 'Rice', optionId: null, quantity: 1 },
          { menuId: 'chicken', menuName: 'GOLDEN FRIED CHICKEN', optionId: null, optionName: 'S Boneless', quantity: 1 },
        ],
      },
    ]
    const slipItems: KitchenSlipRoutingItem[] = [
      {
        id: 'set-1-k1',
        name: '[Set 1] GOLDEN FRIED CHICKEN (S Boneless)',
        qty: 1,
        kitchenPromoGroupId: 'set-1',
        kitchenPromoParentName: '[April] Set 1',
        kitchenPromoParentQty: 1,
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, { orderItems })
    expect(lines).toHaveLength(1)
    expect(lines[0].name).toContain('Set 1')
    expect(lines[0].qty).toBe(1)
    expect(lines[0].promoComposeLines).toEqual([
      'Rice x1',
      'GOLDEN FRIED CHICKEN (S Boneless) x1',
    ])
  })
})
