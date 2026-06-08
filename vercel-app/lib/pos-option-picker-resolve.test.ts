import { describe, expect, it } from "vitest"
import type { PosMenuOption } from "@/lib/api-client"
import { resolvePosOptionPickerMatch } from "@/lib/pos-option-picker-resolve"

describe("resolvePosOptionPickerMatch", () => {
  it("matches cartesian linked row with part and sidedish selections", () => {
    const combined: PosMenuOption = {
      id: "m99-g1i10-g2i20",
      menuId: "99",
      name: "Boneless - Kimchi",
      priceModifier: 15,
      priceModifierDelivery: 15,
      priceModifierPackaging: null,
      sortOrder: 0,
      optionType: "substitution",
      optionStepValues: { part: "Boneless", sidedish: "Kimchi" },
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
    }
    const match = resolvePosOptionPickerMatch({
      menuCode: "C008",
      groups: ["part", "sidedish"],
      selections: { part: "Boneless", sidedish: "Kimchi" },
      optionsWithSteps: [combined],
      allOptions: [combined],
      groupConfigByKey: new Map([
        ["part", { required: true }],
        ["sidedish", { required: true }],
      ]),
    })
    expect(match?.id).toBe(combined.id)
  })

  it("synthesizes match from per-group rows when no single row has all keys", () => {
    const partRow: PosMenuOption = {
      id: "g1-i10",
      menuId: "99",
      name: "Wing",
      priceModifier: 20,
      priceModifierDelivery: 20,
      priceModifierPackaging: null,
      sortOrder: 0,
      optionType: "substitution",
      optionStepValues: { part: "Wing" },
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
    }
    const sideRow: PosMenuOption = {
      id: "g2-i20",
      menuId: "99",
      name: "Kimchi",
      priceModifier: 15,
      priceModifierDelivery: 15,
      priceModifierPackaging: null,
      sortOrder: 1,
      optionType: "substitution",
      optionStepValues: { sidedish: "Kimchi" },
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
    }
    const match = resolvePosOptionPickerMatch({
      menuCode: "C008",
      groups: ["part", "sidedish"],
      selections: { part: "Wing", sidedish: "Kimchi" },
      optionsWithSteps: [partRow, sideRow],
      allOptions: [partRow, sideRow],
      groupConfigByKey: new Map([
        ["part", { required: true }],
        ["sidedish", { required: true }],
      ]),
    })
    expect(match?.priceModifier).toBe(35)
    expect(match?.name).toBe("Wing - Kimchi")
    expect(match?.optionStepValues).toEqual({ part: "Wing", sidedish: "Kimchi" })
  })

  it("uses M - Boneless row label when synthesizing part + sidedish (not Boneless alone)", () => {
    const partRow: PosMenuOption = {
      id: "g1-m-boneless",
      menuId: "99",
      name: "M - Boneless",
      priceModifier: 110,
      priceModifierDelivery: 110,
      priceModifierPackaging: null,
      sortOrder: 0,
      optionType: "substitution",
      optionStepValues: { part: "Boneless" },
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
    }
    const sideRow: PosMenuOption = {
      id: "g2-radish",
      menuId: "99",
      name: "Pickled Radish",
      priceModifier: 0,
      priceModifierDelivery: 0,
      priceModifierPackaging: null,
      sortOrder: 1,
      optionType: "substitution",
      optionStepValues: { sidedish: "Pickled Radish" },
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
    }
    const match = resolvePosOptionPickerMatch({
      menuCode: "C005",
      optionSelectionGroups: ["part", "sidedish"],
      groups: ["part", "sidedish"],
      selections: { part: "Boneless", sidedish: "Pickled Radish" },
      optionsWithSteps: [partRow, sideRow],
      allOptions: [partRow, sideRow],
      groupConfigByKey: new Map([
        ["part", { required: true }],
        ["sidedish", { required: true }],
      ]),
    })
    expect(match?.name).toBe("M - Boneless - Pickled Radish")
  })
})
