import { describe, expect, it } from "vitest"
import type { PosMenuOption } from "@/lib/api-client"
import { collectPosOptionPickerStepValues } from "@/lib/pos-chicken-option-inference"

describe("collectPosOptionPickerStepValues", () => {
  it("infers chicken part values when sidedish step exists but legacy rows lack part key", () => {
    const legacy: PosMenuOption = {
      id: "1",
      menuId: "99",
      name: "M - Wing",
      priceModifier: 30,
      priceModifierDelivery: null,
      priceModifierPackaging: null,
      sortOrder: 0,
      optionType: "substitution",
      optionStepValues: null,
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
    }
    const sidedish: PosMenuOption = {
      id: "2",
      menuId: "99",
      name: "Kimchi",
      priceModifier: 15,
      priceModifierDelivery: null,
      priceModifierPackaging: null,
      sortOrder: 1,
      optionType: "substitution",
      optionStepValues: { sidedish: "Kimchi" },
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
    }
    const opts = [legacy, sidedish]
    const optsWithSteps = opts.filter(
      (o) => o.optionStepValues && Object.keys(o.optionStepValues).length > 0
    )
    const values = collectPosOptionPickerStepValues({
      groupKey: "part",
      groups: ["part", "sidedish"],
      menuCode: "C008",
      options: opts,
      optionsWithSteps: optsWithSteps,
      isChickenMenu: true,
    })
    expect(values).toContain("Wing")
  })
})
