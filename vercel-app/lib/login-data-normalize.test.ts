import { describe, expect, it } from "vitest"
import { asLoginNameList, normalizeLoginUsersMap } from "./login-data-normalize"

describe("asLoginNameList", () => {
  it("keeps string arrays", () => {
    expect(asLoginNameList(["A", " B ", ""])).toEqual(["A", "B"])
  })

  it("wraps a single string", () => {
    expect(asLoginNameList("Somchai")).toEqual(["Somchai"])
  })

  it("returns empty for objects and null", () => {
    expect(asLoginNameList(null)).toEqual([])
    expect(asLoginNameList({ name: "A" })).toEqual([])
  })
})

describe("normalizeLoginUsersMap", () => {
  it("normalizes mixed store values so callers can .map", () => {
    expect(
      normalizeLoginUsersMap({
        "CM Rama9": ["Ann", "Bob"],
        "CM Ladprao": "Chai",
        skip: { not: "array" },
      })
    ).toEqual({
      "CM Rama9": ["Ann", "Bob"],
      "CM Ladprao": ["Chai"],
      skip: [],
    })
  })

  it("rejects array or non-object payloads", () => {
    expect(normalizeLoginUsersMap(["a"])).toEqual({})
    expect(normalizeLoginUsersMap(null)).toEqual({})
  })
})
