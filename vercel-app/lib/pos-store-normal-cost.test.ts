import { describe, expect, it } from 'vitest'
import {
  buildStoreNormalCostRow,
  classifyStoreNormalCostDiscount,
} from '@/lib/pos-store-normal-cost'

const base = {
  storeCode: 'CM01',
  orderCount: 10,
  grossSales: 1000,
  netSales: 800,
  bomCost: 300,
  matchedLineQty: 100,
  unmatchedLineQty: 0,
  accountingSales: 800,
  accountingCogs: 380,
}

describe('classifyStoreNormalCostDiscount', () => {
  it('keeps HQ vs store kinds for the expand breakdown', () => {
    expect(classifyStoreNormalCostDiscount('payment', 'collab')).toBe('hq')
    expect(classifyStoreNormalCostDiscount('payment', 'manual')).toBe('store')
    expect(classifyStoreNormalCostDiscount('payment', 'other')).toBe('unclassified')
  })
})

describe('buildStoreNormalCostRow', () => {
  it('combines discounts and compares BOM % of net to P&L COGS % of sales', () => {
    const row = buildStoreNormalCostRow({
      ...base,
      discountKinds: [
        { layer: 'payment', kind: 'collab', discountAmount: 107 },
        { layer: 'payment', kind: 'manual', discountAmount: 107 },
      ],
    })
    expect(row.totalDiscount).toBe(200)
    expect(row.netSharePct).toBe(80)
    expect(row.discountSharePct).toBe(20)
    expect(row.netSharePct + row.discountSharePct).toBe(100)
    expect(row.normalCostPctOfNet).toBe(37.5)
    expect(row.plCostPct).toBe(47.5)
    expect(row.vsPlPct).toBe(10)
    expect(row.vsPlAmt).toBe(80)
    expect(row.holdReasons).toEqual([])
  })

  it('notes high unmatched BOM but still shows the P&L comparison', () => {
    const row = buildStoreNormalCostRow({
      ...base,
      matchedLineQty: 90,
      unmatchedLineQty: 10,
      discountKinds: [],
    })
    expect(row.holdReasons).toContain('bom_unmatched')
    expect(row.plCostPct).toBe(47.5)
    expect(row.vsPlAmt).toBe(80)
  })

  it('uses the combined discount already inside list price when kind lines differ', () => {
    const row = buildStoreNormalCostRow({
      ...base,
      combinedDiscount: 180,
      discountKinds: [{ layer: 'payment', kind: 'manual', discountAmount: 107 }],
    })
    expect(row.totalDiscount).toBe(180)
    expect(row.discountSharePct).toBe(18)
  })
})
