import { describe, expect, it } from 'vitest'
import {
  aggregateTheoreticalCostFromOrders,
  collectTheoreticalCostUnmatchedLines,
  expandOrderLineToCostLines,
  type TheoreticalCostUnmatchedLine,
} from '@/lib/management-margin-theoretical-cost'
import type { PosMenuCostIndexEntry } from '@/lib/pos-menu-cost-index-server'

function entry(food = 1, packaging = 0): PosMenuCostIndexEntry {
  return {
    costHall: food,
    costDelivery: food + packaging,
    foodCost: food,
    packagingCost: packaging,
  }
}

describe('expandOrderLineToCostLines', () => {
  it('expands promoItems with parent qty multiplier', () => {
    const lines = expandOrderLineToCostLines({
      name: 'Festival Set',
      promoId: '9',
      price: 250,
      qty: 2,
      promoItems: [
        { menuId: '1', menuName: 'Chicken', quantity: 1 },
        { menuId: '2', menuName: 'Drink', quantity: 1 },
      ],
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ menuId: '1', qty: 2 })
    expect(lines[1]).toMatchObject({ menuId: '2', qty: 2 })
  })

  it('splits banban lines across menuId1 and menuId2', () => {
    const lines = expandOrderLineToCostLines({
      name: 'Banban Chicken',
      menuId1: '10',
      menuId2: '11',
      optionId1: '1',
      optionId2: '2',
      quantity: 2,
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ menuId: '10', optionId: '1', qty: 1 })
    expect(lines[1]).toMatchObject({ menuId: '11', optionId: '2', qty: 1 })
  })
})

describe('collectTheoreticalCostUnmatchedLines', () => {
  it('groups missing BOM by menu and option', () => {
    const costIndex = new Map<string, PosMenuCostIndexEntry>([['99|', entry()]])
    const rows = collectTheoreticalCostUnmatchedLines({
      orderRows: [
        {
          items_json: JSON.stringify([
            { menuId: '10', menuName: 'No BOM A', optionId: '1', quantity: 2 },
            { menuId: '10', menuName: 'No BOM A', optionId: '1', qty: 1 },
            { menuId: '11', menuName: 'No BOM B', quantity: 1 },
          ]),
        },
      ],
      costIndex,
    })
    expect(rows).toHaveLength(2)
    const a = rows.find((r) => r.menuId === '10') as TheoreticalCostUnmatchedLine
    expect(a.lineQty).toBe(3)
    expect(a.reason).toBe('missing_bom')
    expect(a.menuLabel).toBe('No BOM A')
  })

  it('tracks lines without menu id separately by name', () => {
    const rows = collectTheoreticalCostUnmatchedLines({
      orderRows: [
        {
          items_json: JSON.stringify([
            { menuName: 'Legacy line', quantity: 2 },
            { menuName: 'Other', quantity: 1 },
          ]),
        },
      ],
      costIndex: new Map(),
    })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.reason === 'missing_menu_id')).toBe(true)
  })

  it('matches set menu via promoItems instead of flagging parent name', () => {
    const costIndex = new Map<string, PosMenuCostIndexEntry>([
      ['1|', entry()],
      ['2|', entry()],
    ])
    const rows = collectTheoreticalCostUnmatchedLines({
      orderRows: [
        {
          items_json: JSON.stringify([
            {
              name: 'Festival Set',
              promoId: '9',
              qty: 2,
              promoItems: [
                { menuId: '1', menuName: 'Chicken', quantity: 1 },
                { menuId: '2', menuName: 'Drink', quantity: 1 },
              ],
            },
          ]),
        },
      ],
      costIndex,
    })
    expect(rows).toHaveLength(0)
  })

  it('flags missing BOM on promo child menus', () => {
    const costIndex = new Map<string, PosMenuCostIndexEntry>([['1|', entry()]])
    const rows = collectTheoreticalCostUnmatchedLines({
      orderRows: [
        {
          items_json: JSON.stringify([
            {
              name: 'Festival Set',
              promoId: '9',
              qty: 1,
              promoItems: [
                { menuId: '1', menuName: 'Chicken', quantity: 1 },
                { menuId: '99', menuName: 'Side', quantity: 1 },
              ],
            },
          ]),
        },
      ],
      costIndex,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.reason).toBe('missing_bom')
    expect(rows[0]?.menuId).toBe('99')
    expect(rows[0]?.menuLabel).toBe('Side')
  })
})

describe('aggregateTheoreticalCostFromOrders', () => {
  it('sums theoretical cost from promoItems children', () => {
    const costIndex = new Map<string, PosMenuCostIndexEntry>([
      ['1|', entry(10)],
      ['2|', entry(5)],
    ])
    const agg = aggregateTheoreticalCostFromOrders({
      orderRows: [
        {
          order_type: 'dine_in',
          items_json: JSON.stringify([
            {
              name: 'Festival Set',
              promoId: '9',
              qty: 2,
              promoItems: [
                { menuId: '1', quantity: 1 },
                { menuId: '2', quantity: 1 },
              ],
            },
          ]),
        },
      ],
      costIndex,
      miseRatePercent: 0,
    })
    expect(agg.matchedLineQty).toBe(4)
    expect(agg.unmatchedLineQty).toBe(0)
    expect(agg.totalCost).toBe(30)
  })
})
