import { describe, expect, it } from "vitest"
import { posCostListRowCostsAndRatios } from "./pos-cost-analysis-display"

describe("posCostListRowCostsAndRatios", () => {
  it("uses API costs as-is because loss rate is already included server-side", () => {
    const result = posCostListRowCostsAndRatios({
      priceHall: 200,
      priceDelivery: 220,
      costHall: 100,
      costDelivery: 110,
    })

    expect(result.costH).toBe(100)
    expect(result.costD).toBe(110)
    expect(result.costRatioH).toBe(50)
    expect(result.costRatioD).toBe(50)
  })

  it("rounds display costs to one decimal without applying an extra fixed mise rate", () => {
    const result = posCostListRowCostsAndRatios({
      priceHall: 100,
      costHall: 12.34,
      costDelivery: 45.67,
    })

    expect(result.costH).toBe(12.3)
    expect(result.costD).toBe(45.7)
  })
})
