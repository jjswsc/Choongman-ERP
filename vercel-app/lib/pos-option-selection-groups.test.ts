import { describe, expect, it } from "vitest"
import {
  filterOptionSelectionGroupsForAudience,
  filterPosOptionsForVisibleGroups,
  isGroupVisibleForStepAudience,
  parseOptionSelectionConfigFromDb,
} from "@/lib/pos-option-selection-groups"

describe("pos-option-selection-groups audience", () => {
  it("parses audience from db json", () => {
    const rows = parseOptionSelectionConfigFromDb([
      { key: "sidedish", label: "Side", audience: "delivery", required: true, minSelect: 1, maxSelect: 1 },
    ])
    expect(rows[0]?.audience).toBe("delivery")
  })

  it("filters groups and options for hall vs delivery", () => {
    const config = new Map([
      ["part", { audience: "all" as const }],
      ["sidedish", { audience: "delivery" as const }],
    ])
    const hallGroups = filterOptionSelectionGroupsForAudience(["part", "sidedish"], config, "hall")
    expect(hallGroups).toEqual(["part"])

    const visible = new Set(hallGroups)
    const options = filterPosOptionsForVisibleGroups(
      [
        { optionStepValues: { part: "Wing" } },
        { optionStepValues: { sidedish: "Kimchi" } },
        { optionStepValues: { part: "Wing", sidedish: "Kimchi" } },
      ],
      visible
    )
    expect(options).toHaveLength(1)
    expect(options[0]?.optionStepValues?.part).toBe("Wing")
  })

  it("isGroupVisibleForStepAudience treats missing as all", () => {
    expect(isGroupVisibleForStepAudience(undefined, "hall")).toBe(true)
    expect(isGroupVisibleForStepAudience("delivery", "hall")).toBe(false)
  })
})
