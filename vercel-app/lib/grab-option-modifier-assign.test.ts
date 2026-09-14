import { describe, expect, it } from "vitest"
import { composeGrabModifierName } from "@/lib/grab-menu-limits"
import {
  GRAB_CHICKEN_DEFAULT_SIZE_OPTION_DESC,
  GRAB_CHICKEN_DEFAULT_SIZE_OPTION_NAME,
  GRAB_CHICKEN_SIZE_GROUP_DISPLAY_NAME,
  applyGrabChickenSizeChoiceGroupMeta,
  dedupeGrabChickenDefaultOptionRows,
  finalizeGrabChickenSizeChoiceRows,
  formatGrabModifierOptionDisplayName,
  grabChickenPartSizeOptionName,
  injectGrabChickenDefaultSizeOption,
  pullGrabChickenDefaultOptionsFromSizeGroup,
  resolveGrabModifierAssignments,
  shouldIncludeStandaloneOptionForLinkedMenu,
  sortGrabChickenSizeChoiceRows,
} from "@/lib/grab-option-modifier-assign"

describe("resolveGrabModifierAssignments", () => {
  it("splits part and sidedish into two Grab modifier groups", () => {
    const out = resolveGrabModifierAssignments(
      {
        name: "Boneless - Kimchi",
        option_step_values: { part: "Boneless", sidedish: "Kimchi" },
      },
      "C008",
      ["part", "sidedish"]
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ groupName: "part", optionName: "Boneless" })
    expect(out[1]).toEqual({ groupName: "sidedish", optionName: "Kimchi" })
  })

  it("keeps chicken legacy size+part in one group but preserves S/M option names", () => {
    const out = resolveGrabModifierAssignments(
      {
        name: "M - Wing",
        option_step_values: { size: "M", part: "Wing" },
      },
      "C008",
      ["size", "part"]
    )
    expect(out).toEqual([{ groupName: "part", optionName: "M - Wing" }])
  })

  it("keeps M - Boneless name when only part step exists", () => {
    const out = resolveGrabModifierAssignments(
      {
        name: "M - Boneless",
        option_step_values: { part: "Boneless" },
      },
      "C018",
      ["part"]
    )
    expect(out).toEqual([{ groupName: "part", optionName: "M - Boneless" }])
  })

  it("keeps S - Boneless name in the part group", () => {
    const out = resolveGrabModifierAssignments(
      {
        name: "S - Boneless",
        option_step_values: { part: "Boneless" },
      },
      "C018",
      ["part"]
    )
    expect(out).toEqual([{ groupName: "part", optionName: "S - Boneless" }])
  })
})

describe("grabChickenPartSizeOptionName", () => {
  it("prefers the POS option name over the part value", () => {
    expect(
      grabChickenPartSizeOptionName({
        originalName: "M - Boneless",
        groupKey: "part",
        stepValue: "Boneless",
      })
    ).toBe("M - Boneless")
  })

  it("composes size + part when the original name is empty", () => {
    expect(
      grabChickenPartSizeOptionName({
        originalName: "",
        groupKey: "part",
        stepValue: "Wing",
        sizeValue: "M",
        partValue: "Wing",
      })
    ).toBe("M - Wing")
  })
})

describe("applyGrabChickenSizeChoiceGroupMeta", () => {
  it("renames generic part/size labels and requires one choice", () => {
    expect(
      applyGrabChickenSizeChoiceGroupMeta({
        groupName: "part",
        label: "Part",
        min: 0,
        max: 1,
      })
    ).toEqual({
      min: 1,
      max: 1,
      groupDisplayName: GRAB_CHICKEN_SIZE_GROUP_DISPLAY_NAME,
    })
  })

  it("leaves sidedish groups unchanged", () => {
    expect(
      applyGrabChickenSizeChoiceGroupMeta({
        groupName: "sidedish",
        label: "sidedish",
        min: 0,
        max: 1,
      })
    ).toEqual({
      min: 0,
      max: 1,
      groupDisplayName: "sidedish",
    })
  })

  it("does not rename a leftover size group to the same title as part", () => {
    expect(
      applyGrabChickenSizeChoiceGroupMeta({
        groupName: "size",
        label: "Size",
        min: 1,
        max: 1,
      })
    ).toEqual({
      min: 1,
      max: 1,
      groupDisplayName: "Size",
    })
  })
})

describe("dedupeGrabChickenDefaultOptionRows", () => {
  it("keeps one S - Boneless and prefers the row with a description", () => {
    const out = dedupeGrabChickenDefaultOptionRows([
      { name: "S - Boneless", description_delivery: null },
      { name: "M - Boneless", description_delivery: null },
      { name: "S - Boneless", description_delivery: "ไม่มีกระดูก 5 ชิ้น 175 g." },
    ])
    expect(out).toEqual([
      { name: "M - Boneless", description_delivery: null },
      { name: "S - Boneless", description_delivery: "ไม่มีกระดูก 5 ชิ้น 175 g." },
    ])
  })
})

describe("sortGrabChickenSizeChoiceRows", () => {
  it("puts S - Boneless first so guests tap the default size first", () => {
    const out = sortGrabChickenSizeChoiceRows([
      { name: "M - Drumette", sort_order: 1 },
      { name: "M - Boneless", sort_order: 0 },
      { name: "S - Boneless", sort_order: 9 },
    ])
    expect(out.map((r) => r.name)).toEqual(["S - Boneless", "M - Boneless", "M - Drumette"])
  })
})

describe("injectGrabChickenDefaultSizeOption", () => {
  it("adds S - Boneless at 0 when Grab only has M upsells", () => {
    const out = injectGrabChickenDefaultSizeOption([
      { name: "M - Boneless", price_modifier: 110, sort_order: 0 },
      { name: "M - Drumette", price_modifier: 110, sort_order: 1 },
      { name: "M - Joint Wing", price_modifier: 110, sort_order: 2 },
    ])
    expect(out[0]).toMatchObject({
      name: GRAB_CHICKEN_DEFAULT_SIZE_OPTION_NAME,
      price_modifier: 0,
      price_modifier_delivery: 0,
      description_delivery: GRAB_CHICKEN_DEFAULT_SIZE_OPTION_DESC,
    })
    expect(out.map((r) => r.name)).toEqual([
      "S - Boneless",
      "M - Boneless",
      "M - Drumette",
      "M - Joint Wing",
    ])
  })

  it("does not add a second S when one already exists", () => {
    const out = injectGrabChickenDefaultSizeOption([
      { name: "S - Boneless", price_modifier: 0 },
      { name: "M - Boneless", price_modifier: 110 },
    ])
    expect(out.filter((r) => r.name === "S - Boneless")).toHaveLength(1)
  })

  it("does not invent S for Supreme-style menus without M upsells", () => {
    const out = injectGrabChickenDefaultSizeOption([{ name: "Kimchi", price_modifier: 0 }])
    expect(out.map((r) => r.name)).toEqual(["Kimchi"])
  })
})

describe("finalizeGrabChickenSizeChoiceRows", () => {
  it("puts injected S first in the guest size list", () => {
    const out = finalizeGrabChickenSizeChoiceRows([
      { name: "M - Drumette", price_modifier: 110, sort_order: 1 },
      { name: "M - Boneless", price_modifier: 110, sort_order: 0 },
    ])
    expect(out.map((r) => r.name)).toEqual(["S - Boneless", "M - Boneless", "M - Drumette"])
  })
})

describe("pullGrabChickenDefaultOptionsFromSizeGroup", () => {
  it("moves Size S from leftover size group into part", () => {
    const out = pullGrabChickenDefaultOptionsFromSizeGroup(
      [{ name: "M - Boneless" }],
      [{ name: "Size S" }, { name: "Size M" }]
    )
    expect(out.partRows.map((r) => r.name)).toEqual(["Size S", "M - Boneless"])
    expect(out.sizeRows.map((r) => r.name)).toEqual(["Size M"])
  })
})

describe("Grab S modifier name length", () => {
  it("keeps injected S name + desc within Grab 40-char modifier limit", () => {
    const name = composeGrabModifierName(
      GRAB_CHICKEN_DEFAULT_SIZE_OPTION_NAME,
      GRAB_CHICKEN_DEFAULT_SIZE_OPTION_DESC
    )
    expect(name.length).toBeLessThanOrEqual(40)
    expect(name.startsWith("S - Boneless")).toBe(true)
  })
})

describe("formatGrabModifierOptionDisplayName", () => {
  it("does not prefix group name (Grab shows group header separately)", () => {
    expect(formatGrabModifierOptionDisplayName("sidedish", "Kimchi")).toBe("Kimchi")
    expect(formatGrabModifierOptionDisplayName("M", "Boneless")).toBe("Boneless")
  })

  it("strips redundant group prefix already stored in option label", () => {
    expect(formatGrabModifierOptionDisplayName("sidedish", "sidedish Kimchi")).toBe("Kimchi")
    expect(formatGrabModifierOptionDisplayName("sidedish", "sidedish - Pickled Radish")).toBe(
      "Pickled Radish"
    )
  })
})

describe("shouldIncludeStandaloneOptionForLinkedMenu", () => {
  it("includes legacy rows without step values when menu has links", () => {
    expect(shouldIncludeStandaloneOptionForLinkedMenu(null, new Set(["sidedish"]))).toBe(true)
  })

  it("excludes standalone when all step keys are covered by links", () => {
    expect(
      shouldIncludeStandaloneOptionForLinkedMenu({ sidedish: "Kimchi" }, new Set(["sidedish"]))
    ).toBe(false)
  })

  it("includes standalone when part key is not in linked groups", () => {
    expect(
      shouldIncludeStandaloneOptionForLinkedMenu({ part: "Wing" }, new Set(["sidedish"]))
    ).toBe(true)
  })
})
