import { describe, expect, it } from 'vitest'
import {
  collectTheoreticalCostUnmatchedLines,
  type TheoreticalCostUnmatchedLine,
} from '@/lib/management-margin-theoretical-cost'
import type { PosMenuCostIndexEntry } from '@/lib/pos-menu-cost-index-server'

function entry(): PosMenuCostIndexEntry {
  return { costHall: 1, costDelivery: 1, foodCost: 1, packagingCost: 0 }
}

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
})
