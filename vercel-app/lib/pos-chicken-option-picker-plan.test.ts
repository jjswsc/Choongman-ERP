import { describe, expect, it } from "vitest"
import type { PosMenu, PosMenuOption } from "@/lib/api-client"
import {
  chickenOptionPickerHasVisibleChoices,
  resolveChickenOptionPickerPlan,
  resolveChickenOptionPickerStepTitleSuffix,
  shouldInitChickenTwoPhaseOnMenuOpen,
  shouldOpenChickenOptionPicker,
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
        options: [
          { ...mBoneless, menuId: "bbq", optionStepValues: {} },
          { ...kimchi, menuId: "bbq" },
        ],
        orderType: "delivery",
      })
    ).toBe(true)
  })

  it("uses flat-list for Special chicken when sidedish has no pickup options", () => {
    const specialMenu: PosMenu = {
      ...soyMenu,
      id: "special",
      code: "C099",
      name: "SOY SAUCE AND SPRING ONION CHICKEN",
      category: "SPECIALTIES",
      optionSelectionGroups: ["part", "sidedish"],
    }
    const partOpts: PosMenuOption[] = [
      {
        ...mBoneless,
        id: "m1",
        menuId: "special",
        name: "M - Boneless",
        optionStepValues: { part: "Boneless" },
      },
      {
        ...mBoneless,
        id: "m2",
        menuId: "special",
        name: "M - Drumette",
        optionStepValues: { part: "Drumette" },
      },
    ]
    const plan = resolveChickenOptionPickerPlan({
      menu: specialMenu,
      options: partOpts,
      orderType: "takeout",
      twoPhasePhase: null,
      optionPickerStep: 0,
      optionPickerSelections: {},
      t,
    })
    expect(plan.mode).toBe("flat-list")
    expect(plan.flatListOpts.length).toBeGreaterThan(0)
    expect(plan.activeStepGroups).toEqual(["part"])
  })

  it("skips empty Supreme picker when only hidden Size S remains", () => {
    const supremeMenu: PosMenu = {
      ...soyMenu,
      id: "5",
      code: "C002",
      name: "Supreme Chicken",
      category: "SPECIALTIES",
      optionSelectionGroups: ["part", "sidedish"],
      optionSelectionConfig: [
        { key: "part", label: "part", audience: "all", required: true },
        { key: "sidedish", label: "sidedish", audience: "delivery", required: true },
      ],
    }
    const sizeS: PosMenuOption = {
      ...mBoneless,
      id: "s1",
      menuId: "5",
      name: "Size S - Boneless",
      priceModifier: 0,
      optionStepValues: { size: "S", part: "Boneless" },
    }
    const plan = resolveChickenOptionPickerPlan({
      menu: supremeMenu,
      options: [sizeS],
      orderType: "delivery",
      twoPhasePhase: null,
      optionPickerStep: 0,
      optionPickerSelections: {},
      t,
    })
    expect(plan.activeStepGroups).toEqual([])
    expect(plan.flatListOpts).toEqual([])
    expect(plan.chickenDefaultDisplay).toBe("")
    expect(chickenOptionPickerHasVisibleChoices(plan)).toBe(false)
    expect(
      shouldOpenChickenOptionPicker({
        menu: supremeMenu,
        options: [sizeS],
        orderType: "delivery",
      })
    ).toBe(false)
    expect(
      resolveChickenOptionPickerStepTitleSuffix({
        menu: supremeMenu,
        orderType: "delivery",
        twoPhasePhase: null,
        optionPickerStep: 0,
        options: [sizeS],
      })
    ).toBe("")
  })

  it("opens Supreme sidedish picker when Kimchi remains after hiding Size S", () => {
    const supremeMenu: PosMenu = {
      ...soyMenu,
      id: "5",
      code: "C002",
      name: "Supreme Chicken",
      category: "SPECIALTIES",
      optionSelectionGroups: ["part", "sidedish"],
      optionSelectionConfig: [
        { key: "part", label: "part", audience: "all", required: true },
        { key: "sidedish", label: "sidedish", audience: "delivery", required: true },
      ],
    }
    const sizeS: PosMenuOption = {
      ...mBoneless,
      id: "s1",
      menuId: "5",
      name: "Size S - Boneless",
      priceModifier: 0,
      optionStepValues: { size: "S", part: "Boneless" },
    }
    const kimchiOpt: PosMenuOption = { ...kimchi, menuId: "5" }
    const plan = resolveChickenOptionPickerPlan({
      menu: supremeMenu,
      options: [sizeS, kimchiOpt],
      orderType: "delivery",
      twoPhasePhase: null,
      optionPickerStep: 0,
      optionPickerSelections: {},
      t,
    })
    expect(plan.activeStepGroups).toEqual(["sidedish"])
    expect(plan.mode).toBe("multistep")
    expect(plan.multistep?.stepValues).toContain("Kimchi")
    expect(
      shouldOpenChickenOptionPicker({
        menu: supremeMenu,
        options: [sizeS, kimchiOpt],
        orderType: "delivery",
      })
    ).toBe(true)
  })
})
