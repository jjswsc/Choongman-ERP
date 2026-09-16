import { describe, expect, it } from "vitest"
import {
  isDraftPosMenuOptionId,
  isPersistedPosMenuOptionId,
  optionConfigHasResettableState,
  optionConfigResetTargetGroups,
  optionRowUsesLinkedGroupItem,
  parsePosLinkedOptionGroupItemRefs,
  pickLinkedOptionGroupItemToDelete,
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

describe("linked option group item ids", () => {
  it("parses per-group and cartesian virtual ids", () => {
    expect(parsePosLinkedOptionGroupItemRefs("g12-i34")).toEqual([{ groupId: 12, itemId: 34 }])
    expect(parsePosLinkedOptionGroupItemRefs("m99-g12i34")).toEqual([{ groupId: 12, itemId: 34 }])
    expect(parsePosLinkedOptionGroupItemRefs("m99-g12i34-g15i50")).toEqual([
      { groupId: 12, itemId: 34 },
      { groupId: 15, itemId: 50 },
    ])
    expect(parsePosLinkedOptionGroupItemRefs("12")).toEqual([])
    expect(parsePosLinkedOptionGroupItemRefs("draft-1")).toEqual([])
    expect(isDraftPosMenuOptionId("draft-abc")).toBe(true)
  })

  it("picks the selected step item from a cartesian row", () => {
    const groups = [
      { id: "12", key: "part" },
      { id: "15", key: "sidedish" },
    ]
    expect(pickLinkedOptionGroupItemToDelete("m99-g12i34-g15i50", groups, "sidedish")).toEqual({
      groupId: 15,
      itemId: 50,
    })
    expect(optionRowUsesLinkedGroupItem("m99-g12i34-g15i50", { groupId: 15, itemId: 50 })).toBe(true)
    expect(optionRowUsesLinkedGroupItem("m99-g12i34-g15i88", { groupId: 15, itemId: 50 })).toBe(false)
  })
})
