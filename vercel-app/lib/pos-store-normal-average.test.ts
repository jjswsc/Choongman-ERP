import { describe, expect, it } from 'vitest'
import { computeStoreNormalKpi, parseStoreNormalAvgExcluded } from '@/lib/pos-store-normal-average'
import type { StoreNormalCostRow } from '@/lib/pos-store-normal-cost'

function row(storeCode: string, netSales: number, bomCost: number, plSales: number, plCogs: number): StoreNormalCostRow {
  return {
    storeCode,
    netSales,
    grossSales: netSales,
    totalDiscount: 0,
    bomCost,
    accountingSales: plSales,
    accountingCogs: plCogs,
  } as StoreNormalCostRow
}

describe('computeStoreNormalKpi', () => {
  const rows = [row('A', 1000, 340, 1000, 400), row('B', 1000, 340, 1000, 400), row('ASOKE', 1000, 340, 1000, 70)]

  it('averages all stores by sales when nothing is excluded', () => {
    const kpi = computeStoreNormalKpi(rows, 'excluded', new Set())
    expect(kpi.stores).toBe(3)
    expect(kpi.excludedStores).toBe(0)
    expect(kpi.plPct).toBeCloseTo(29, 5)
  })

  it('drops excluded stores from every average and count', () => {
    const kpi = computeStoreNormalKpi(rows, 'excluded', new Set(['ASOKE', 'NOT_IN_RESULT']))
    expect(kpi.stores).toBe(2)
    expect(kpi.excludedStores).toBe(1)
    expect(kpi.plPct).toBeCloseTo(40, 5)
    expect(kpi.normalPct).toBeCloseTo(34, 5)
    expect(kpi.higherPl).toBe(2)
  })
})

describe('parseStoreNormalAvgExcluded', () => {
  it('keeps unique non-empty strings only', () => {
    expect(parseStoreNormalAvgExcluded(['CM Asoke', ' CM Asoke ', '', 3, 'CM Bangna'])).toEqual(['CM Asoke', 'CM Bangna'])
    expect(parseStoreNormalAvgExcluded('x')).toEqual([])
  })
})
