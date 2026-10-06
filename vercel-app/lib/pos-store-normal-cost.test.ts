import { describe, expect, it } from 'vitest'
import {
  buildStoreNormalCostRow,
  classifyStoreNormalCostDiscount,
  resolveStoreNormalAccounting,
  resolveStoreNormalPosSales,
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
    expect(row.normalCostPctOfGross).toBe(30)
    expect(row.theoryCostPct).toBe(37.5)
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
    expect(row.theoryCostPct).toBe(37.5)
  })
})

describe('resolveStoreNormalPosSales', () => {
  it('shows VAT-included list price and net receipts without changing the theoretical rate', () => {
    const row = buildStoreNormalCostRow({
      ...base,
      discountKinds: [],
      grossSales: 1196576.91,
      netSales: 1128943.71,
      bomCost: 384354.15,
      combinedDiscount: 67633.2,
      grossSalesIncluded: 1280337.29,
      netSalesIncluded: 1207969.77,
      totalDiscountIncluded: 72367.52,
    })
    const included = resolveStoreNormalPosSales(row, 'included')
    const excluded = resolveStoreNormalPosSales(row, 'excluded')
    expect(included.gross).toBe(1280337.29)
    expect(included.net).toBe(1207969.77)
    expect(included.discount).toBe(72367.52)
    expect(excluded.net).toBe(1128943.71)
    expect(Number(row.theoryCostPct.toFixed(1))).toBe(34)
  })

  it('grosses up cached rows that only have VAT-excluded sales', () => {
    const row = buildStoreNormalCostRow({
      ...base,
      discountKinds: [],
      grossSales: 1000,
      netSales: 900,
      combinedDiscount: 100,
    })
    const included = resolveStoreNormalPosSales(row, 'included')
    expect(included.net).toBe(963)
    expect(included.discount).toBe(107)
    expect(included.gross).toBe(1070)
  })
})

describe('resolveStoreNormalAccounting', () => {
  it('uses the income-statement VAT mode so included and excluded rates stay with their own amounts', () => {
    const row = buildStoreNormalCostRow({
      ...base,
      discountKinds: [],
      accountingSales: 1129873.65,
      accountingCogs: 477155.46,
      accountingSalesIncluded: 1207969,
      accountingCogsIncluded: 496416.33,
    })
    const included = resolveStoreNormalAccounting(row, 'included')
    const excluded = resolveStoreNormalAccounting(row, 'excluded')
    expect(included.cogs).toBe(496416.33)
    expect(Number(included.costPct?.toFixed(1))).toBe(41.1)
    expect(excluded.cogs).toBe(477155.46)
    expect(Number(excluded.costPct?.toFixed(1))).toBe(42.2)
  })
})
