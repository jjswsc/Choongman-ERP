import { describe, expect, it } from "vitest"
import { posOptionRowMatchesPickerSelections } from "@/lib/pos-option-step-selection-match"

describe("posOptionRowMatchesPickerSelections", () => {
  const optionalAddConfig = new Map([["add", { required: false }]])

  it("skipped optional group does not match rows that carry an add-on value", () => {
    const matches = posOptionRowMatchesPickerSelections(
      { add: "Small Kimchi Soup" },
      ["add"],
      {},
      optionalAddConfig
    )
    expect(matches).toBe(false)
  })

  it("skipped optional group matches rows with empty step value for that group", () => {
    const matches = posOptionRowMatchesPickerSelections({ add: "" }, ["add"], {}, optionalAddConfig)
    expect(matches).toBe(true)
  })

  it("required group still requires exact selection match", () => {
    const config = new Map([
      ["part", { required: true }],
      ["sidedish", { required: false }],
    ])
    const withSide = posOptionRowMatchesPickerSelections(
      { part: "Boneless", sidedish: "Kimchi" },
      ["part", "sidedish"],
      { part: "Boneless" },
      config
    )
    const withoutSide = posOptionRowMatchesPickerSelections(
      { part: "Boneless" },
      ["part", "sidedish"],
      { part: "Boneless" },
      config
    )
    expect(withSide).toBe(false)
    expect(withoutSide).toBe(true)
  })
})
