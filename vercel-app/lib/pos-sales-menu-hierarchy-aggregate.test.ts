import { describe, expect, it } from 'vitest'
import {
  aggregatePosSalesMenuHierarchy,
  filterHierarchyRows,
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

  it('filters rows by search tokens', () => {
    const rows = [
      { key: 'a', label: 'Snow Onion', qty: 1, sales: 100 },
      { key: 'b', label: 'Curry', qty: 2, sales: 50 },
    ]
    const filtered = filterHierarchyRows(rows, ['snow'], false)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.label).toBe('Snow Onion')
  })
})
