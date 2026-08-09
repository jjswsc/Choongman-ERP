import { describe, expect, it } from 'vitest'
import {
  aggregateTheoreticalCostFromOrders,
  buildTheoreticalCostResolveContext,
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

function ctxFixture() {
  const costIndex = new Map<string, PosMenuCostIndexEntry>([
    ['8|', entry()],
    ['22|', entry()],
    ['20|', entry()],
    ['4|', entry(12)],
    ['4|7', entry(52)],
    ['999|', entry(12)],
  ])
  return buildTheoreticalCostResolveContext({
    costIndex,
    catalog: {
      menus: [
        { id: '8', name: 'SNOW ONION' },
        { id: '22', name: 'Rice' },
        { id: '20', name: 'GOLDEN FRIED CHICKEN' },
        { id: '501', name: '[April] Set 2' },
        { id: '4', name: 'KIMCHI SOUP' },
        { id: '999', name: 'KIMCHI SOUP With Rice' },
      ],
      optionsByMenuId: {
        '4': [{ id: '7', name: 'With Rice', priceModifier: 20 }],
      },
      promoMetaById: new Map([
        ['5', { code: 'SET-A2', name: '[April] Set 2', kind: 'set' }],
      ]),
      promoIdByMirrorMenuId: new Map([['501', '5']]),
      promoItemsByPromoId: new Map([
        [
          '5',
          [
            { menuId: '20', quantity: 1 },
            { menuId: '22', quantity: 1 },
          ],
        ],
      ]),
    },
  })
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

  it('resolves menu id from cart line id and grab set child name', () => {
    const ctx = ctxFixture()
    const fromId = expandOrderLineToCostLines({ id: '8-2', name: 'SNOW ONION', qty: 1 }, ctx)
    expect(fromId[0]?.menuId).toBe('8')

    const fromGrabChild = expandOrderLineToCostLines(
      { name: '[[April] Set 1] SNOW ONION', qty: 2 },
      ctx
    )
    expect(fromGrabChild[0]).toMatchObject({ menuId: '8', qty: 2 })
  })

  it('expands promo template from catalog when order snapshot lacks promoItems', () => {
    const ctx = ctxFixture()
    const lines = expandOrderLineToCostLines(
      { name: '[April] Set 2', promoId: '5', qty: 2 },
      ctx
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ menuId: '20', qty: 2 })
    expect(lines[1]).toMatchObject({ menuId: '22', qty: 2 })
  })

  it('skips grabSetChild rows merged into parent promoItems', () => {
    const ctx = ctxFixture()
    expect(
      expandOrderLineToCostLines({ name: 'SNOW ONION', grabSetChild: true, qty: 1 }, ctx)
    ).toHaveLength(0)
  })

  it('expands POS mirror set menu id into constituent menu BOM lines', () => {
    const ctx = ctxFixture()
    const lines = expandOrderLineToCostLines(
      { menuId1: '501', name: '[April] Set 2', qty: 3 },
      ctx
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ menuId: '20', qty: 3 })
    expect(lines[1]).toMatchObject({ menuId: '22', qty: 3 })

    const costIndex = new Map<string, PosMenuCostIndexEntry>([
      ['20|', entry(10)],
      ['22|', entry(5)],
    ])
    const rows = collectTheoreticalCostUnmatchedLines({
      orderRows: [
        {
          items_json: JSON.stringify([{ menuId1: '501', name: '[April] Set 2', qty: 2 }]),
        },
      ],
      costIndex,
      resolveContext: ctx,
    })
    expect(rows).toHaveLength(0)
  })

  it('infers With Rice optionId when menuId present but optionId null', () => {
    const ctx = ctxFixture()
    const lines = expandOrderLineToCostLines(
      {
        menuId: '4',
        optionId: null,
        name: 'KIMCHI SOUP With Rice',
        quantity: 1,
      },
      ctx
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ menuId: '4', optionId: '7', qty: 1 })
  })

  it('prefers composed base+option over dedicated SKU with same display name', () => {
    const ctx = ctxFixture()
    const lines = expandOrderLineToCostLines(
      {
        menuId: '999',
        optionId: null,
        name: 'KIMCHI SOUP With Rice',
        quantity: 2,
      },
      ctx
    )
    expect(lines[0]).toMatchObject({ menuId: '4', optionId: '7', qty: 2 })
  })

  it('remaps order menu_id=29 option null via catalog name / With Rice strip', () => {
    const costIndex = new Map<string, PosMenuCostIndexEntry>([
      ['4|', entry(40)],
      ['4|7', entry(52)],
      ['29|', entry(12)],
    ])
    const ctx = buildTheoreticalCostResolveContext({
      costIndex,
      catalog: {
        menus: [
          { id: '4', name: 'KIMCHI SOUP' },
          { id: '29', name: 'KIMCHI SOUP With Rice' },
        ],
        optionsByMenuId: {
          '4': [{ id: '7', name: 'With Rice', priceModifier: 20 }],
        },
        promoMetaById: new Map(),
        promoItemsByPromoId: new Map(),
        promoIdByMirrorMenuId: new Map(),
      },
    })
    const lines = expandOrderLineToCostLines(
      {
        menuId: '29',
        optionId: null,
        name: 'KIMCHI SOUP With Rice',
        quantity: 481,
      },
      ctx
    )
    expect(lines[0]).toMatchObject({ menuId: '4', optionId: '7', qty: 481 })
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
