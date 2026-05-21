import { describe, expect, it } from 'vitest'
import {
  buildKitchenHallStyleSlipLines,
  parseKitchenSplitPromoLineName,
} from './pos-kitchen-slip-display'
import { buildGrabPosCatalog } from './grab-pos-order-enrich'
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

  it('resolves promo optionCode and hides raw code-only parent note', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [{ optionCode: 'C011-1', name: 'S Boneless' }, { optionCode: 'C011-5', name: 'Pickled Radish' }]
    )
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'line-c011',
        name: 'GOLDEN FRIED CHICKEN',
        qty: 1,
        promoItems: [
          { menuId: 'chicken', menuName: 'GOLDEN FRIED CHICKEN', optionId: null, optionCode: 'C011-1', quantity: 1 },
        ],
      },
    ]
    const slipItems: KitchenSlipRoutingItem[] = [
      {
        id: 'line-c011-k1',
        name: '[GOLDEN FRIED CHICKEN] GOLDEN FRIED CHICKEN',
        qty: 1,
        note: 'optc:C011-1',
        kitchenPromoGroupId: 'line-c011',
        kitchenPromoParentName: 'GOLDEN FRIED CHICKEN',
        kitchenPromoParentQty: 1,
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      orderItems,
      optionNameByCode: catalog.optionNameByCode,
    })
    expect(lines[0].promoComposeLines).toEqual(['GOLDEN FRIED CHICKEN (S Boneless) x1'])
    expect(lines[0].note).toBeUndefined()
  })

  it('matches promo parent by stripped bracket tag and keeps decorated set name', () => {
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'promo-order-1',
        name: '[April] Set 2',
        qty: 1,
        promoItems: [{ menuId: '8', menuName: 'SNOW ONION', optionId: null, quantity: 1 }],
      },
    ]
    const slipItems: KitchenSlipRoutingItem[] = [
      {
        id: 'promo-order-1-k1',
        name: '[Set 2] SNOW ONION (M - Joint Wing)',
        qty: 1,
        kitchenPromoGroupId: '',
        kitchenPromoParentName: 'Set 2',
        kitchenPromoParentQty: 1,
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, { orderItems })
    expect(lines[0].name).toBe('[April] Set 2')
  })

  it('maps code-like regular line names to menu names', () => {
    const slipItems: KitchenSlipRoutingItem[] = [
      { id: 'line-1', name: 'C008', qty: 1, note: 'SNOW ONION (M - Joint Wing) x1' },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      menuNameByMenuId: { '8': 'SNOW ONION' },
      menuCodeByMenuId: { '8': 'C008' },
    })
    expect(lines[0].name).toBe('SNOW ONION')
  })

  it('grab banban compose shows flavor only without repeating menu name', () => {
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'grab:banban',
        name: 'Banban Chicken',
        qty: 1,
        promoItems: [
          {
            menuId: '24',
            menuName: 'Banban Chicken',
            optionId: null,
            optionName: 'SOY SAUCE CHICKEN',
            quantity: 1,
          },
          {
            menuId: '24',
            menuName: 'Banban Chicken',
            optionId: null,
            optionName: 'Kimchi',
            quantity: 1,
          },
        ],
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(orderItems, {
      orderItems,
      grabInbound: true,
    })
    expect(lines[0].promoComposeLines).toEqual(['SOY SAUCE CHICKEN x1', 'Kimchi x1'])
  })

  it('splits grab promo options onto separate compose lines', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [
        { optionCode: 'C011-3', name: 'SOY SAUCE AND SPRING ONION CHICKEN' },
        { optionCode: 'C011-4', name: 'CURRYCANE' },
        { optionCode: 'C011-5', name: 'Kimchi' },
      ]
    )
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'grab:line-1',
        name: 'Banban Chicken',
        qty: 1,
        note: 'optc:C011-3, C011-4, C011-5',
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(orderItems, {
      orderItems,
      optionNameByCode: catalog.optionNameByCode,
      grabInbound: true,
    })
    expect(lines[0].note).toContain('SOY SAUCE')
    expect(lines[0].note?.split('\n')).toHaveLength(3)
  })

  it('resolves long grab menu codes to menu names', () => {
    const slipItems: KitchenSlipRoutingItem[] = [
      { id: 'grab:line-2', name: '260485-S01', qty: 1, note: 'PEPSI MEGA 1 x1' },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      menuNameByMenuId: { '99': 'PEPSI MEGA 1' },
      menuCodeByMenuId: { '99': '260485-S01' },
      grabInbound: true,
    })
    expect(lines[0].name).toBe('PEPSI MEGA 1')
  })

  it('falls back to grab note label when long code has no menu code mapping', () => {
    const slipItems: KitchenSlipRoutingItem[] = [
      { id: 'grab:line-3', name: '260457-S01', qty: 1, note: 'PEPSI MEGA 1 x1' },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      grabInbound: true,
    })
    expect(lines[0].name).toBe('PEPSI MEGA 1')
    expect(lines[0].note).toBeUndefined()
  })

  it('treats grab promo code as menu code mapping source', () => {
    const orderItems: KitchenSlipRoutingItem[] = [
      {
        id: 'promo-1',
        name: 'PEPSI MEGA 2',
        qty: 1,
        promoCode: '260457-S02',
      },
    ]
    const slipItems: KitchenSlipRoutingItem[] = [
      { id: 'grab:line-4', name: '260457-S02', qty: 1 },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      orderItems,
      grabInbound: true,
    })
    expect(lines[0].name).toBe('PEPSI MEGA 2')
  })

  it('maps code-like grouped parent names to menu names from compose lines', () => {
    const slipItems: KitchenSlipRoutingItem[] = [
      {
        id: 'grp-1-k1',
        name: '[C008] [C008] SNOW ONION (M - Joint Wing)',
        qty: 1,
        kitchenPromoGroupId: 'grp-1',
        kitchenPromoParentName: 'C008',
        kitchenPromoParentQty: 1,
      },
    ]
    const lines = buildKitchenHallStyleSlipLines(slipItems, {
      menuNameByMenuId: { '8': 'SNOW ONION' },
      menuCodeByMenuId: { '8': 'C008' },
    })
    expect(lines[0].name).toBe('SNOW ONION')
  })
})
