import { describe, expect, it } from 'vitest'
import {
  buildStoreNormalCostRow,
  classifyStoreNormalCostDiscount,
  sumIngredientUsageMoney,
} from '@/lib/pos-store-normal-cost'

const base = {
  storeCode: 'CM01',
  orderCount: 10,
  grossSales: 1000,
  netSales: 800,
  bomCost: 300,
  matchedLineQty: 100,
  unmatchedLineQty: 0,
  ingredientTheoryCost: 300,
  actualUsageCost: 360,
  hasEndingCount: true,
  accountingCogs: 380,
}

describe('classifyStoreNormalCostDiscount', () => {
  it('puts HQ promo and payment kinds outside the store score', () => {
    expect(classifyStoreNormalCostDiscount('payment', 'collab')).toBe('hq')
    expect(classifyStoreNormalCostDiscount('payment', 'coupon')).toBe('hq')
    expect(classifyStoreNormalCostDiscount('payment', 'platform')).toBe('hq')
    expect(classifyStoreNormalCostDiscount('payment', 'tier')).toBe('hq')
    expect(classifyStoreNormalCostDiscount('bundle', 'set')).toBe('hq')
    expect(classifyStoreNormalCostDiscount('bundle', 'campaign')).toBe('hq')
    expect(classifyStoreNormalCostDiscount('bundle', 'platform')).toBe('hq')
    expect(classifyStoreNormalCostDiscount('payment', 'manual')).toBe('store')
    expect(classifyStoreNormalCostDiscount('payment', 'other')).toBe('unclassified')
    expect(classifyStoreNormalCostDiscount('bundle', 'other')).toBe('unclassified')
  })
})

describe('buildStoreNormalCostRow', () => {
  it('scores only usage above theory and manual discount, not HQ discount', () => {
    const row = buildStoreNormalCostRow({
      ...base,
      discountKinds: [
        { layer: 'payment', kind: 'collab', discountAmount: 107 },
        { layer: 'payment', kind: 'manual', discountAmount: 107 },
      ],
    })
    expect(row.hqDiscount).toBe(100)
    expect(row.storeDiscount).toBe(100)
    expect(row.foodVariance).toBe(60)
    expect(row.storeGap).toBe(160)
    expect(row.storeGapPctOfNet).toBe(20)
    expect(row.normalCostPctOfGross).toBe(30)
    expect(row.normalCostPctOfNet).toBe(37.5)
    expect(row.accountingGap).toBe(20)
    expect(row.gapHeld).toBe(false)
  })

  it('shows under-usage as savings and does not reduce the gap', () => {
    const row = buildStoreNormalCostRow({
      ...base,
      actualUsageCost: 250,
      discountKinds: [{ layer: 'payment', kind: 'manual', discountAmount: 107 }],
    })
    expect(row.foodVariance).toBe(-50)
    expect(row.storeGap).toBe(100)
  })

  it('holds the whole gap when BOM unmatched share is at least 10%', () => {
    const row = buildStoreNormalCostRow({
      ...base,
      matchedLineQty: 90,
      unmatchedLineQty: 10,
      discountKinds: [{ layer: 'payment', kind: 'manual', discountAmount: 107 }],
    })
    expect(row.holdReasons).toContain('bom_unmatched')
    expect(row.gapHeld).toBe(true)
    expect(row.storeGap).toBeNull()
  })

  it('holds food score without an ending count but keeps manual discount', () => {
    const row = buildStoreNormalCostRow({
      ...base,
      hasEndingCount: false,
      discountKinds: [{ layer: 'payment', kind: 'manual', discountAmount: 107 }],
    })
    expect(row.holdReasons).toContain('no_ending_count')
    expect(row.foodScoreHeld).toBe(true)
    expect(row.gapHeld).toBe(false)
    expect(row.foodVariance).toBe(60)
    expect(row.storeGap).toBe(100)
  })

  it('holds food score when BOM and ingredient theory differ by more than 5%', () => {
    const held = buildStoreNormalCostRow({
      ...base,
      bomCost: 100,
      ingredientTheoryCost: 106,
      actualUsageCost: 106,
      discountKinds: [],
    })
    expect(held.holdReasons).toContain('engine_gap')
    expect(held.foodScoreHeld).toBe(true)
    expect(held.storeGap).toBe(0)

    const ok = buildStoreNormalCostRow({
      ...base,
      bomCost: 100,
      ingredientTheoryCost: 105,
      actualUsageCost: 120,
      discountKinds: [],
    })
    expect(ok.holdReasons).not.toContain('engine_gap')
    expect(ok.storeGap).toBe(15)
  })
})

describe('sumIngredientUsageMoney', () => {
  it('sums qty times unit cost and treats low adjustment coverage as no ending count', () => {
    const low = sumIngredientUsageMoney({
      theoreticalQtyByCode: { A: 2, B: 1 },
      actualRows: [
        { item_code: 'A', actual_usage_qty: 5, has_adjustment: true },
        { item_code: 'B', actual_usage_qty: 1, has_adjustment: false },
        { item_code: 'C', actual_usage_qty: 0, has_adjustment: false },
        { item_code: 'D', actual_usage_qty: 0, has_adjustment: false },
      ],
      items: [
        { code: 'A', cost: 10 },
        { code: 'B', cost: 4 },
      ],
    })
    expect(low.theoreticalCost).toBe(24)
    expect(low.actualCost).toBe(54)
    expect(low.hasEndingCount).toBe(false)

    const enough = sumIngredientUsageMoney({
      theoreticalQtyByCode: { A: 1 },
      actualRows: [
        { item_code: 'A', actual_usage_qty: 1, has_adjustment: true },
        { item_code: 'B', actual_usage_qty: 0, has_adjustment: true },
      ],
      items: [{ code: 'A', cost: 10 }],
    })
    expect(enough.coverage).toBe(1)
    expect(enough.hasEndingCount).toBe(true)
  })
})
