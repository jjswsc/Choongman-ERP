import { describe, expect, it } from "vitest"
import {
  resolveGrabModifierAssignments,
  shouldIncludeStandaloneOptionForLinkedMenu,
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

  it("keeps chicken legacy size+part row in part group only", () => {
    const out = resolveGrabModifierAssignments(
      {
        name: "M - Wing",
        option_step_values: { size: "M", part: "Wing" },
      },
      "C008",
      ["size", "part"]
    )
    expect(out).toEqual([{ groupName: "part", optionName: "Wing" }])
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
