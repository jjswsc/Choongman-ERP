import { describe, expect, it } from 'vitest'
import {
  aggregatePosSalesMenuHierarchy,
  extractOptionSuffixFromOrderLineName,
  filterHierarchyRows,
  filterHierarchyRowsByDrill,
  parsePromoBracketName,
} from '@/lib/pos-sales-menu-hierarchy-aggregate'

describe('aggregatePosSalesMenuHierarchy', () => {
  it('rolls up menu lines with options by catalog', () => {
    const result = aggregatePosSalesMenuHierarchy({
      menus: [
        {
          id: 101,
          name: 'Snow Onion',
          category_main: 'Chicken',
          category: 'Snow Onion Series',
        },
      ],
      options: [{ id: 501, menu_id: 101, name: 'Size S', option_code: 'S' }],
      orderRows: [
        {
          status: 'completed',
          items_json: JSON.stringify([
            {
              id: '101',
              menuId: '101',
              optionId: '501',
              name: 'Snow Onion S',
              price: 139,
              qty: 2,
            },
            {
              id: '101',
              menuId: '101',
              optionId: '501',
              name: 'Snow Onion S',
              price: 139,
              qty: 1,
            },
          ]),
        },
      ],
    })

    expect(result.levels.menu).toHaveLength(1)
    expect(result.levels.menu[0]?.label).toBe('Snow Onion')
    expect(result.levels.menu[0]?.qty).toBe(3)
    expect(result.levels.option[0]?.label).toContain('Size S')
    expect(result.levels.main[0]?.label).toBe('Chicken')
    expect(result.levels.category[0]?.label).toBe('Snow Onion Series')
  })

  it('resolves linked group option ids and name suffix fallback', () => {
    const result = aggregatePosSalesMenuHierarchy({
      menus: [{ id: 101, name: 'Snow Onion', category_main: 'Chicken', category: 'Series' }],
      options: [
        {
          id: 'm101-g5i10-g6i20',
          menu_id: 101,
          name: 'S - Boneless',
          option_step_values: { size: 'S', part: 'Boneless' },
        },
      ],
      orderRows: [
        {
          status: 'completed',
          items_json: JSON.stringify([
            {
              menuId1: '101',
              optionId1: 'm101-g5i10-g6i20',
              name: 'Snow Onion (S - Boneless)',
              price: 139,
              qty: 4,
            },
            {
              menuId1: '101',
              name: 'Snow Onion (M - Wing)',
              price: 159,
              qty: 1,
            },
          ]),
        },
      ],
    })

    expect(result.levels.option).toHaveLength(2)
    const labels = result.levels.option.map((r) => r.label)
    expect(labels.some((l) => l.includes('S - Boneless'))).toBe(true)
    expect(labels.some((l) => l.includes('M - Wing'))).toBe(true)
    expect(labels.every((l) => !l.includes('(기본)'))).toBe(true)
  })

  it('extractOptionSuffixFromOrderLineName parses bracket suffix', () => {
    expect(extractOptionSuffixFromOrderLineName('Snow Onion (S - Boneless)', 'Snow Onion')).toBe(
      'S - Boneless'
    )
  })

  it('merges same display name even when line ids differ (Grab-style)', () => {
    const result = aggregatePosSalesMenuHierarchy({
      menus: [],
      options: [],
      orderRows: [
        {
          status: 'completed',
          items_json: JSON.stringify([
            {
              id: 'grab:item-1:L0',
              name: 'Jeju black lava chicken',
              price: 333,
              qty: 1,
            },
            {
              id: 'grab:item-2:L0',
              name: 'Jeju black lava chicken',
              price: 333,
              qty: 1,
            },
            {
              id: 'grab:item-3:L0',
              name: 'Jeju black lava chicken',
              menuId: 'grab:item-3:L0',
              price: 333,
              qty: 1,
            },
            {
              id: 'x1',
              name: 'Samgyetang',
              price: 320,
              qty: 1,
            },
            {
              id: 'x2',
              name: 'Samgyetang',
              price: 320,
              qty: 1,
            },
          ]),
        },
      ],
    })

    expect(result.levels.menu).toHaveLength(2)
    const jeju = result.levels.menu.find((r) => r.label === 'Jeju black lava chicken')
    expect(jeju?.qty).toBe(3)
    expect(jeju?.sales).toBe(999)
    const sam = result.levels.menu.find((r) => r.label === 'Samgyetang')
    expect(sam?.qty).toBe(2)
    expect(sam?.sales).toBe(640)
  })

  it('merges menu level across option variants when catalog missing', () => {
    const result = aggregatePosSalesMenuHierarchy({
      menus: [],
      options: [],
      orderRows: [
        {
          status: 'completed',
          items_json: JSON.stringify([
            { id: 'a', name: 'Snow Onion (S - Boneless)', price: 139, qty: 1 },
            { id: 'b', name: 'Snow Onion (M - Wing)', price: 159, qty: 2 },
          ]),
        },
      ],
    })

    expect(result.levels.menu).toHaveLength(1)
    expect(result.levels.menu[0]?.label).toBe('Snow Onion')
    expect(result.levels.menu[0]?.qty).toBe(3)
    expect(result.levels.option).toHaveLength(2)
  })

  it('resolves catalog id by name when line menuId is opaque', () => {
    const result = aggregatePosSalesMenuHierarchy({
      menus: [
        {
          id: 77,
          name: 'Jeju black lava chicken',
          category_main: 'Chicken',
          category: 'SPECIALTIES',
        },
      ],
      options: [],
      orderRows: [
        {
          status: 'completed',
          items_json: JSON.stringify([
            {
              id: 'grab:1:L0',
              menuId: 'grab:1:L0',
              name: 'Jeju black lava chicken',
              price: 333,
              qty: 1,
            },
            {
              id: 'grab:2:L0',
              name: 'Jeju black lava chicken',
              price: 333,
              qty: 1,
            },
          ]),
        },
      ],
    })

    expect(result.levels.menu).toHaveLength(1)
    expect(result.levels.menu[0]?.qty).toBe(2)
    expect(result.levels.menu[0]?.category).toBe('SPECIALTIES')
    expect(result.levels.menu[0]?.categoryMain).toBe('Chicken')
  })

  it('attributes banban dual-flavor lines to Banban parent, not first flavor', () => {
    const result = aggregatePosSalesMenuHierarchy({
      menus: [
        {
          id: 24,
          name: 'Banban Chicken',
          category_main: 'Chicken',
          category: 'Banban',
        },
        {
          id: 101,
          name: 'HOT SNOW ONION',
          category_main: 'Chicken',
          category: 'ChickenSNOW',
        },
        {
          id: 202,
          name: 'CURRY Bar.B.Q FRIED CHICKEN',
          category_main: 'Chicken',
          category: 'ChickenBar.B.Q',
        },
      ],
      options: [],
      orderRows: [
        {
          status: 'completed',
          items_json: JSON.stringify([
            {
              name: 'Banban Chicken (HOT SNOW ONION / CURRY Bar.B.Q FRIED CHICKEN)',
              price: 199,
              qty: 2,
              menuId1: '101',
              menuId2: '202',
            },
            {
              name: 'Banban Chicken (RED HOT CHICKEN / GOLDEN FRIED CHICKEN)',
              price: 199,
              qty: 1,
              menuId: '24',
              menuId1: '301',
              menuId2: '302',
            },
          ]),
        },
      ],
    })

    expect(result.levels.menu).toHaveLength(1)
    expect(result.levels.menu[0]?.label).toBe('Banban Chicken')
    expect(result.levels.menu[0]?.qty).toBe(3)
    expect(result.levels.category[0]?.label).toBe('Banban')
    expect(result.levels.option.every((r) => r.label.startsWith('Banban Chicken —'))).toBe(true)
    expect(result.levels.option.some((r) => r.label.includes('HOT SNOW ONION / CURRY'))).toBe(true)
    expect(result.levels.menu.some((r) => r.label === 'HOT SNOW ONION')).toBe(false)
  })

  it('keeps single-flavor menuId1 lines on the regular menu', () => {
    const result = aggregatePosSalesMenuHierarchy({
      menus: [{ id: 101, name: 'Snow Onion', category_main: 'Chicken', category: 'Series' }],
      options: [
        {
          id: 'm101-g5i10-g6i20',
          menu_id: 101,
          name: 'S - Boneless',
          option_step_values: { size: 'S', part: 'Boneless' },
        },
      ],
      orderRows: [
        {
          status: 'completed',
          items_json: JSON.stringify([
            {
              menuId1: '101',
              optionId1: 'm101-g5i10-g6i20',
              name: 'Snow Onion (S - Boneless)',
              price: 139,
              qty: 1,
            },
          ]),
        },
      ],
    })

    expect(result.levels.menu[0]?.label).toBe('Snow Onion')
    expect(result.levels.option[0]?.label).toContain('S - Boneless')
  })

  it('filters rows by search tokens', () => {
    const rows = [
      { key: 'a', label: 'Snow Onion', qty: 1, sales: 100 },
      { key: 'b', label: 'Curry', qty: 2, sales: 50 },
    ]
    const filtered = filterHierarchyRows(rows, ['snow'], false)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.label).toBe('Snow Onion')
  })

  it('aggregates promo set by parent name when searching promo group', () => {
    const result = aggregatePosSalesMenuHierarchy({
      menus: [],
      options: [],
      orderRows: [
        {
          status: 'completed',
          items_json: JSON.stringify([
            {
              id: 'set-line',
              name: '[Super Deal] Set 3',
              price: 333,
              qty: 2,
              promoId: '99',
              promoItems: [
                { menuId: '1', optionId: null, quantity: 1, menuName: 'Rice' },
                { menuId: '2', optionId: '3', quantity: 1, menuName: 'CURRY Bar.B.Q FRIED CHICKEN' },
              ],
            },
          ]),
        },
      ],
      searchTokens: ['super deal'],
      searchAnd: false,
    })

    expect(result.levels.menu).toHaveLength(1)
    expect(result.levels.menu[0]?.label).toBe('[Super Deal] Set 3')
    expect(result.levels.menu[0]?.qty).toBe(2)
    expect(result.levels.menu[0]?.sales).toBe(666)
    expect(result.levels.category.some((r) => r.label === 'Super Deal')).toBe(true)
    expect(result.levels.main.some((r) => r.label === 'Super Deal')).toBe(true)
  })

  it('expands promo set to child menus when not searching by promo parent', () => {
    const result = aggregatePosSalesMenuHierarchy({
      menus: [],
      options: [],
      orderRows: [
        {
          status: 'completed',
          items_json: JSON.stringify([
            {
              id: 'set-line',
              name: '[Super Deal] Set 3',
              price: 333,
              qty: 1,
              promoId: '99',
              promoItems: [
                { menuId: '1', optionId: null, quantity: 1, menuName: 'Rice' },
                { menuId: '2', optionId: '3', quantity: 1, menuName: 'CURRY Bar.B.Q FRIED CHICKEN' },
              ],
            },
          ]),
        },
      ],
    })

    expect(result.levels.menu.map((r) => r.label).sort()).toEqual([
      'CURRY Bar.B.Q FRIED CHICKEN',
      'Rice',
    ])
    expect(filterHierarchyRows(result.levels.menu, ['super deal'], false)).toHaveLength(0)
  })

  it('parsePromoBracketName extracts group label', () => {
    expect(parsePromoBracketName('[Super Deal] Set 3')).toBe('Super Deal')
    expect(parsePromoBracketName('Snow Onion')).toBe('')
  })

  it('filters child levels by drill parent', () => {
    const categories = [
      { key: 'a', label: 'Series A', categoryMain: 'Chicken', category: 'Series A' },
      { key: 'b', label: 'Series B', categoryMain: 'Side', category: 'Series B' },
    ]
    const menus = [
      { key: 'm1', label: 'Snow Onion', categoryMain: 'Chicken', category: 'Series A' },
      { key: 'm2', label: 'Curry', categoryMain: 'Chicken', category: 'Series B' },
      { key: 'm3', label: 'Fries', categoryMain: 'Side', category: 'Series B' },
    ]
    const options = [
      { key: 'o1', label: 'Snow Onion — Size S', categoryMain: 'Chicken', category: 'Series A' },
      { key: 'o2', label: 'Curry — Size M', categoryMain: 'Chicken', category: 'Series B' },
    ]

    expect(filterHierarchyRowsByDrill(categories, 'category', { main: 'Chicken' })).toHaveLength(1)
    expect(
      filterHierarchyRowsByDrill(categories, 'category', { main: 'Chicken' })[0]?.label
    ).toBe('Series A')

    expect(
      filterHierarchyRowsByDrill(menus, 'menu', { main: 'Chicken', category: 'Series A' })
    ).toHaveLength(1)
    expect(
      filterHierarchyRowsByDrill(menus, 'menu', { main: 'Chicken', category: 'Series A' })[0]?.label
    ).toBe('Snow Onion')

    expect(filterHierarchyRowsByDrill(options, 'option', { menu: 'Snow Onion' })).toHaveLength(1)
    expect(
      filterHierarchyRowsByDrill(options, 'option', { menu: 'Snow Onion' })[0]?.label
    ).toContain('Size S')
  })
})
