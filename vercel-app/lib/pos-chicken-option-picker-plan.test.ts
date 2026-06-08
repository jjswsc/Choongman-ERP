import { describe, expect, it } from "vitest"
import type { PosMenu, PosMenuOption } from "@/lib/api-client"
import {
  resolveChickenOptionPickerPlan,
  shouldInitChickenTwoPhaseOnMenuOpen,
} from "@/lib/pos-chicken-option-picker-plan"

const t = (k: string) => k

const bbqMenu: PosMenu = {
  id: "bbq",
  code: "C022",
  name: "GARLIC Bar.B.Q",
  category: "Bar.B.Q",
  categoryMain: "Chicken",
  optionSelectionGroups: ["sidedish"],
  optionSelectionConfig: [{ key: "sidedish", label: "사이드", audience: "delivery", required: false }],
} as PosMenu

const soyMenu: PosMenu = {
  id: "soy",
  code: "C008",
  name: "SOY SAUCE CHICKEN",
  category: "ORIGINAL",
  categoryMain: "Chicken",
  optionSelectionGroups: ["part", "sidedish"],
  optionSelectionConfig: [
    { key: "part", label: "part", audience: "all", required: false },
    { key: "sidedish", label: "sidedish", audience: "delivery", required: false },
  ],
} as PosMenu

const mBoneless: PosMenuOption = {
  id: "m1",
  menuId: "soy",
  name: "M - Boneless",
  priceModifier: 90,
  priceModifierDelivery: null,
  priceModifierPackaging: null,
  sortOrder: 0,
  optionType: "substitution",
  optionStepValues: { part: "Boneless" },
  sellHall: true,
  sellDelivery: true,
  sellPackaging: true,
}

const kimchi: PosMenuOption = {
  id: "k1",
  menuId: "soy",
  name: "Kimchi",
  priceModifier: 0,
  priceModifierDelivery: null,
  priceModifierPackaging: null,
  sortOrder: 1,
  optionType: "substitution",
  optionStepValues: { sidedish: "Kimchi" },
  sellHall: true,
  sellDelivery: true,
  sellPackaging: true,
}

describe("resolveChickenOptionPickerPlan", () => {
  it("uses two-phase M size mode for BBQ with sidedish on delivery", () => {
    const opts: PosMenuOption[] = [
      {
        ...mBoneless,
        menuId: "bbq",
        optionStepValues: {},
      },
      { ...kimchi, menuId: "bbq" },
    ]
    const plan = resolveChickenOptionPickerPlan({
      menu: bbqMenu,
      options: opts,
      orderType: "delivery",
      twoPhasePhase: "size",
      optionPickerStep: 0,
      optionPickerSelections: {},
      t,
    })
    expect(plan.mode).toBe("two-phase-m-size")
    expect(plan.inMSizePhase).toBe(true)
    expect(plan.flatMOpts.some((o) => o.name === "M - Boneless")).toBe(true)
  })

  it("uses multistep with price list for general chicken part step", () => {
    const plan = resolveChickenOptionPickerPlan({
      menu: soyMenu,
      options: [mBoneless, kimchi],
      orderType: "delivery",
      twoPhasePhase: null,
      optionPickerStep: 0,
      optionPickerSelections: {},
      t,
    })
    expect(plan.mode).toBe("multistep")
    expect(plan.multistep?.usePriceList).toBe(true)
    expect(plan.multistep?.groupKey).toBe("part")
  })

  it("shouldInitChickenTwoPhaseOnMenuOpen for BBQ delivery", () => {
    expect(
      shouldInitChickenTwoPhaseOnMenuOpen({
        menu: bbqMenu,
        options: [{ ...mBoneless, menuId: "bbq", optionStepValues: {} }],
        orderType: "delivery",
      })
    ).toBe(true)
  })
})
