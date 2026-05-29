import { describe, expect, it } from 'vitest'
import { buildHierarchyChannelCompareRows } from '@/lib/pos-sales-menu-hierarchy-compare'

describe('buildHierarchyChannelCompareRows', () => {
  it('merges rows by key across channels', () => {
    const rows = buildHierarchyChannelCompareRows(
      'menu',
      {
        dine_in: {
          main: [],
          category: [],
          menu: [{ key: 'm1', label: 'Snow Onion', qty: 10, sales: 1390 }],
          option: [],
        },
        delivery: {
          main: [],
          category: [],
          menu: [{ key: 'm1', label: 'Snow Onion', qty: 4, sales: 556 }],
          option: [],
        },
      },
      ['dine_in', 'delivery']
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.channels.dine_in?.qty).toBe(10)
    expect(rows[0]?.channels.delivery?.qty).toBe(4)
    expect(rows[0]?.totalQty).toBe(14)
    expect(rows[0]?.totalSales).toBe(1946)
  })
})
