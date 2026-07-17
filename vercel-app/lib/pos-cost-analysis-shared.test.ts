import { describe, expect, it } from "vitest"
import {
  computePosCostRowMetrics,
  costRatioTier,
  countMenusUsingItemCode,
  rowMatchesSaleFilter,
  simulateItemPriceDelta,
  simulateRecipeLineCostDelta,
} from "@/lib/pos-cost-analysis-shared"
import type { PosMenuCostAnalysisRow } from "@/lib/api-client"

const baseRow: PosMenuCostAnalysisRow = {
  menuId: "1",
  menuCode: "C101",
  menuName: "Test Menu",
  category: "Chicken",
  categoryMain: "Food",
  priceHall: 107,
  priceDelivery: 107,
  vatIncluded: true,
  optionId: null,
  optionName: null,
  costHall: 30,
  costDelivery: 35,
  breakdown: [
    {
      itemCode: "ITEM1",
      itemName: "Chicken",
      unit: "g",
      costPerUnit: 1,
      quantity: 30,
      lossRate: 0,
      costTotal: 30,
      source: "hq",
      ingredientType: "food",
    },
  ],
}

describe("pos-cost-analysis-shared", () => {
  it("costRatioTier 구간을 판정한다", () => {
    expect(costRatioTier(30)).toBe("good")
    expect(costRatioTier(38)).toBe("caution")
    expect(costRatioTier(50)).toBe("danger")
    expect(costRatioTier(0)).toBe("na")
  })

  it("행 메트릭에 마진과 이슈를 포함한다", () => {
    const m = computePosCostRowMetrics(baseRow, 3)
    expect(m.costHMise).toBe(30)
    expect(m.marginH).toBeGreaterThan(0)
    expect(m.issues).not.toContain("no_bom")
  })

  it("원가율 분모는 VAT 제외 매출(계산기와 동일)이다", () => {
    const m = computePosCostRowMetrics({ ...baseRow, costHall: 30, costDelivery: 30 }, 0)
    // 판매가 107(In VAT) → 공급가 100, 원가 30 → 30%
    expect(m.netSalesH).toBe(100)
    expect(m.costRatioH).toBeCloseTo(30, 5)
    // VAT 포함 분모면 ~28%로 과소 — 회귀 방지
    expect(m.costRatioH).toBeGreaterThan(28.5)
  })

  it("품목 사용 메뉴 수를 센다", () => {
    const { count } = countMenusUsingItemCode([baseRow], "ITEM1")
    expect(count).toBe(1)
  })

  it("what-if 시뮬레이션으로 원가율 변화를 계산한다", () => {
    const sim = simulateItemPriceDelta([baseRow], "ITEM1", 10, 3)
    expect(sim.length).toBe(1)
    expect(sim[0]!.afterRatioH).toBeGreaterThan(sim[0]!.beforeRatioH)
  })

  it("레시피 라인 단가 변동 증분을 계산한다", () => {
    const delta = simulateRecipeLineCostDelta([{ itemCode: "A", lineCost: 100 }], "A", 10)
    expect(delta).toBeCloseTo(10)
  })

  it("판매 상태 필터를 판정한다", () => {
    expect(rowMatchesSaleFilter({ isActive: true }, "active")).toBe(true)
    expect(rowMatchesSaleFilter({ isActive: false }, "active")).toBe(false)
    expect(rowMatchesSaleFilter({ isActive: false }, "inactive")).toBe(true)
    expect(rowMatchesSaleFilter({ isActive: true }, "all")).toBe(true)
    expect(rowMatchesSaleFilter({}, "active")).toBe(true)
  })
})
