import { describe, expect, it } from "vitest"
import { getItemCostPerUnit } from "@/lib/item-cost-util"
import {
  buildCostAnalysisLookups,
  calcPromoEconomics,
  calcRegularPriceSum,
  resolveCostFromAnalysisMaps,
} from "@/lib/promo-economics"

type RecipeLine = { itemUnitCost: number; usage: number }

function calcMenuCost(lines: RecipeLine[]): number {
  return lines.reduce((sum, line) => sum + line.itemUnitCost * line.usage, 0)
}

describe("Menu flow harness - 품목 > 메뉴 > 원가분석", () => {
  it("품목 단가 변경이 메뉴 원가와 원가율에 연쇄 반영된다", () => {
    const chickenCostPerGramBefore = getItemCostPerUnit(
      { price: 120, total_quantity: 1000, unit: "g" },
      false
    )
    const chickenCostPerGramAfter = getItemCostPerUnit(
      { price: 150, total_quantity: 1000, unit: "g" },
      false
    )
    const sauceCostPerGram = getItemCostPerUnit(
      { price: 60, total_quantity: 500, unit: "g" },
      false
    )

    const recipeBefore = calcMenuCost([
      { itemUnitCost: chickenCostPerGramBefore, usage: 180 },
      { itemUnitCost: sauceCostPerGram, usage: 30 },
    ])
    const recipeAfter = calcMenuCost([
      { itemUnitCost: chickenCostPerGramAfter, usage: 180 },
      { itemUnitCost: sauceCostPerGram, usage: 30 },
    ])

    const economicsBefore = calcPromoEconomics({
      regularPriceSum: 259,
      costTotalHall: recipeBefore,
      costTotalDelivery: recipeBefore,
      salePriceHall: 259,
    })
    const economicsAfter = calcPromoEconomics({
      regularPriceSum: 259,
      costTotalHall: recipeAfter,
      costTotalDelivery: recipeAfter,
      salePriceHall: 259,
    })

    expect(recipeAfter).toBeGreaterThan(recipeBefore)
    expect(economicsAfter.costRateHall).toBeGreaterThan(economicsBefore.costRateHall)
  })

  it("원가분석 맵은 menuId 우선, 없으면 menuCode 폴백으로 해석된다", () => {
    const rows = [
      { menu_id: "101", option_id: null, cost_hall: 98, cost_delivery: 110, menu_code: "CHICKEN-RICE" },
    ]
    const { byMenuKey, byCodeKey } = buildCostAnalysisLookups(rows)

    const byId = resolveCostFromAnalysisMaps(byMenuKey, byCodeKey, { "101": { code: "CHICKEN-RICE" } }, "101", null)
    const byCodeFallback = resolveCostFromAnalysisMaps(
      byMenuKey,
      byCodeKey,
      { "999": { code: "CHICKEN-RICE" } },
      "999",
      null
    )

    expect(byId?.hall).toBe(98)
    expect(byCodeFallback?.hall).toBe(98)
  })

  it("메뉴+옵션 정가 합과 원가를 기준으로 마진이 계산된다", () => {
    const regular = calcRegularPriceSum({
      items: [{ menuId: "101", optionId: "1", quantity: 2 }],
      menus: [{ id: "101", price: 120 }],
      optionsByMenuId: {
        "101": [{ id: "1", priceModifier: 20 }],
      },
      channel: "hall",
    })

    const economics = calcPromoEconomics({
      regularPriceSum: regular,
      costTotalHall: 180,
      costTotalDelivery: 190,
      salePriceHall: 250,
      salePriceDelivery: 270,
    })

    expect(regular).toBe(280)
    expect(economics.discountAmt).toBe(30)
    expect(economics.marginBaht).toBe(70)
    expect(economics.marginBahtDel).toBe(80)
  })
})
