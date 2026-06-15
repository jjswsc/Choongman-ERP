import { describe, expect, it, beforeEach } from "vitest"
import {
  clearRuntimeIngredients,
  getIngredient,
  getIngredientCodeByItemCode,
  reResolveRecipeItems,
  seedRuntimeFromBreakdownRow,
  setRuntimeApiItems,
  setRuntimeSauces,
} from "./cost-data"

describe("cost-data runtime resolve", () => {
  beforeEach(() => {
    clearRuntimeIngredients()
    setRuntimeApiItems([])
    setRuntimeSauces([])
  })

  it("calculator 모드에서도 store_use 배합을 itemCode로 조회한다", () => {
    setRuntimeSauces(
      [
        {
          code: "S028",
          name: "Black Lava Marinade",
          costPerUnit: 0.336,
          usageKind: "store_use",
        },
      ],
      { mode: "calculator" }
    )

    const code = getIngredientCodeByItemCode("S028")
    expect(code).toBeDefined()
    const ing = getIngredient(code!)
    expect(ing?.name).toBe("Black Lava Marinade")
    expect(ing?.bahtPerUnit).toBeCloseTo(0.336, 5)
  })

  it("itemCode 대소문자 차이를 무시한다", () => {
    setRuntimeApiItems([
      {
        code: "S029",
        name: "Orange Dust",
        price: 120,
        totalQuantity: 1000,
        unit: "g",
        category: "Seasoning",
      },
    ])
    expect(getIngredientCodeByItemCode("s029")).toBeDefined()
  })

  it("breakdown 폴백 후 API 로드 시 savedItemCode로 재매핑한다", () => {
    const fallbackCode = seedRuntimeFromBreakdownRow({
      itemCode: "S028",
      itemName: "S028",
      costPerUnit: 0,
      ingredientType: "food",
      fallbackIndex: 0,
    })
    const items = reResolveRecipeItems([
      { ingredientCode: fallbackCode, quantity: 100, savedItemCode: "S028" },
    ])

    setRuntimeSauces([
      { code: "S028", name: "Store Blend", costPerUnit: 0.25, usageKind: "store_use" },
    ])

    const resolved = reResolveRecipeItems(items)
    const ing = getIngredient(resolved[0]!.ingredientCode)
    expect(ing?.name).toBe("Store Blend")
    expect(ing?.bahtPerUnit).toBe(0.25)
  })
})
