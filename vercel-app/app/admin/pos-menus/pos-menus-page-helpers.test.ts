import { describe, expect, it } from "vitest"
import {
  isPersistedPosMenuOptionId,
  optionConfigHasResettableState,
  optionConfigResetTargetGroups,
} from "./pos-menus-page-helpers"

describe("option config reset helpers", () => {
  it("treats only numeric ids as persisted pos_menu_options rows", () => {
    expect(isPersistedPosMenuOptionId("12")).toBe(true)
    expect(isPersistedPosMenuOptionId("m99-g1i10-g2i20")).toBe(false)
    expect(isPersistedPosMenuOptionId("virtual:part")).toBe(false)
    expect(isPersistedPosMenuOptionId("")).toBe(false)
  })

  it("keeps chicken part step after reset and treats that as already cleared", () => {
    expect(optionConfigResetTargetGroups("C002")).toEqual(["part"])
    expect(optionConfigHasResettableState(0, ["part"], "C002")).toBe(false)
    expect(optionConfigHasResettableState(8, ["part", "sidedish"], "C002")).toBe(true)
    expect(optionConfigHasResettableState(0, ["part", "sidedish"], "C002")).toBe(true)
  })

  it("clears non-chicken steps completely", () => {
    expect(optionConfigResetTargetGroups("S001")).toEqual([])
    expect(optionConfigHasResettableState(0, [], "S001")).toBe(false)
    expect(optionConfigHasResettableState(0, ["sidedish"], "S001")).toBe(true)
  })
})
