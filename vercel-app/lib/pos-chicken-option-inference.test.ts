import { describe, expect, it } from "vitest"
import type { PosMenuOption } from "@/lib/api-client"
import {
  collectPosOptionPickerStepValues,
  filterFlatChickenMListOptions,
  isChickenSizeOnlyOptionName,
  menuHasChickenSizeProfile,
  resolveChickenDefaultOptionDisplayName,
  shouldUseFlatChickenMOptionPicker,
  collectChickenMultistepPriceListRows,
  computeChickenMultistepRowPrice,
} from "@/lib/pos-chicken-option-inference"

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

describe("shouldUseFlatChickenMOptionPicker", () => {
  it("uses flat picker when chicken has M-named rows without size group", () => {
    const rows: PosMenuOption[] = [
      {
        id: "1",
        menuId: "c013",
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
      },
      {
        id: "2",
        menuId: "c013",
        name: "M - Drumette",
        priceModifier: 90,
        priceModifierDelivery: null,
        priceModifierPackaging: null,
        sortOrder: 1,
        optionType: "substitution",
        optionStepValues: { part: "Drumette" },
        sellHall: true,
        sellDelivery: true,
        sellPackaging: true,
      },
    ]
    const withSteps = rows.filter((o) => o.optionStepValues && Object.keys(o.optionStepValues).length > 0)
    expect(
      shouldUseFlatChickenMOptionPicker({
        menuCode: "C013",
        groups: ["part"],
        options: rows,
        optionsWithSteps: withSteps,
      })
    ).toBe(true)
  })

  it("does not force flat picker when size group is explicit", () => {
    const rows: PosMenuOption[] = [
      {
        id: "1",
        menuId: "c020",
        name: "M - Boneless",
        priceModifier: 90,
        priceModifierDelivery: null,
        priceModifierPackaging: null,
        sortOrder: 0,
        optionType: "substitution",
        optionStepValues: { size: "M", part: "Boneless" },
        sellHall: true,
        sellDelivery: true,
        sellPackaging: true,
      },
    ]
    expect(
      shouldUseFlatChickenMOptionPicker({
        menuCode: "C020",
        groups: ["size", "part"],
        options: rows,
        optionsWithSteps: rows,
      })
    ).toBe(false)
  })

  it("does not force flat picker when sidedish follows part (delivery multistep)", () => {
    const rows: PosMenuOption[] = [
      {
        id: "1",
        menuId: "c003",
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
      },
      {
        id: "2",
        menuId: "c003",
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
      },
    ]
    const withSteps = rows.filter((o) => o.optionStepValues && Object.keys(o.optionStepValues).length > 0)
    expect(
      shouldUseFlatChickenMOptionPicker({
        menuCode: "C003",
        groups: ["part", "sidedish"],
        options: rows,
        optionsWithSteps: withSteps,
      })
    ).toBe(false)
  })
})

describe("fixed-size specialty chicken (Supreme)", () => {
  const supremeOpts: PosMenuOption[] = [
    {
      id: "1",
      menuId: "5",
      name: "Size S - Boneless",
      priceModifier: 0,
      priceModifierDelivery: null,
      priceModifierPackaging: null,
      sortOrder: 0,
      optionType: "substitution",
      optionStepValues: { size: "S", part: "Boneless" },
      sellHall: true,
      sellDelivery: true,
      sellPackaging: true,
    },
    {
      id: "2",
      menuId: "5",
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
    },
  ]

  it("does not treat Supreme as having S/M/L size profile when only Size S row exists", () => {
    expect(menuHasChickenSizeProfile(supremeOpts)).toBe(false)
    expect(resolveChickenDefaultOptionDisplayName(supremeOpts)).toBe("")
  })

  it("hides Size S - Boneless from option lists", () => {
    expect(isChickenSizeOnlyOptionName("Size S - Boneless")).toBe(true)
    expect(isChickenSizeOnlyOptionName("S - Boneless")).toBe(true)
    expect(isChickenSizeOnlyOptionName("S - Wing")).toBe(true)
    expect(isChickenSizeOnlyOptionName("Kimchi")).toBe(false)
  })

  it("never hides real M/L upsell part options", () => {
    expect(isChickenSizeOnlyOptionName("M - Boneless")).toBe(false)
    expect(isChickenSizeOnlyOptionName("M - Drumette")).toBe(false)
    expect(isChickenSizeOnlyOptionName("M - Joint Wings")).toBe(false)
    expect(isChickenSizeOnlyOptionName("L - Boneless")).toBe(false)
  })
})

describe("filterFlatChickenMListOptions", () => {
  it("keeps only M-prefixed chicken substitutions", () => {
    const rows: PosMenuOption[] = [
      {
        id: "1",
        menuId: "c010",
        name: "M - Boneless",
        priceModifier: 90,
        priceModifierDelivery: null,
        priceModifierPackaging: null,
        sortOrder: 0,
        optionType: "substitution",
        optionStepValues: null,
        sellHall: true,
        sellDelivery: true,
        sellPackaging: true,
      },
      {
        id: "2",
        menuId: "c010",
        name: "Kimchi 30g.",
        priceModifier: 0,
        priceModifierDelivery: null,
        priceModifierPackaging: null,
        sortOrder: 1,
        optionType: "substitution",
        optionStepValues: { sidedish: "Kimchi" },
        sellHall: true,
        sellDelivery: true,
        sellPackaging: true,
      },
    ]
    const filtered = filterFlatChickenMListOptions(rows)
    expect(filtered.map((x) => x.name)).toEqual(["M - Boneless"])
  })
})

describe("collectChickenMultistepPriceListRows", () => {
  const mBoneless: PosMenuOption = {
    id: "m1",
    menuId: "c008",
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
  const mWing: PosMenuOption = {
    id: "m2",
    menuId: "c008",
    name: "M - Wing",
    priceModifier: 90,
    priceModifierDelivery: null,
    priceModifierPackaging: null,
    sortOrder: 1,
    optionType: "substitution",
    optionStepValues: { part: "Wing" },
    sellHall: true,
    sellDelivery: true,
    sellPackaging: true,
  }
  const kimchi: PosMenuOption = {
    id: "s1",
    menuId: "c008",
    name: "Kimchi 30g.",
    priceModifier: 0,
    priceModifierDelivery: null,
    priceModifierPackaging: null,
    sortOrder: 2,
    optionType: "substitution",
    optionStepValues: { sidedish: "Kimchi" },
    sellHall: true,
    sellDelivery: true,
    sellPackaging: true,
  }

  it("returns M-named part rows with step values for multistep part phase", () => {
    const rows = collectChickenMultistepPriceListRows({
      groupKey: "part",
      groups: ["part", "sidedish"],
      menuCode: "C008",
      options: [mBoneless, mWing, kimchi],
      optionsWithSteps: [mBoneless, mWing, kimchi],
    })
    expect(rows.map((r) => r.stepValue)).toEqual(["Boneless", "Wing"])
    expect(rows[0].option.name).toBe("M - Boneless")
  })

  it("computes sidedish row price including prior part modifier", () => {
    const price = computeChickenMultistepRowPrice({
      menuBasePrice: 159,
      groupKey: "sidedish",
      option: kimchi,
      groups: ["part", "sidedish"],
      menuCode: "C008",
      pendingSelections: { part: "Boneless" },
      optionsWithSteps: [mBoneless, mWing, kimchi],
      getOptionModifier: (o) => o.priceModifier ?? 0,
    })
    expect(price).toBe(249)
  })
})
