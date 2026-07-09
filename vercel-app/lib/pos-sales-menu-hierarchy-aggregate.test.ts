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
