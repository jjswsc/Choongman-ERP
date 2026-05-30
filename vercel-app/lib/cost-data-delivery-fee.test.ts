import { describe, expect, it } from "vitest"
import {
  DELIVERY_APP_FEE_PERCENT_DEFAULT,
  normalizeDeliveryAppFeePercent,
  resolveMisePercent,
  resolveDeliveryAppFeePercent,
} from "./cost-data"

describe("delivery app fee percent", () => {
  it("defaults when unset", () => {
    expect(resolveDeliveryAppFeePercent(null)).toBe(DELIVERY_APP_FEE_PERCENT_DEFAULT)
    expect(resolveDeliveryAppFeePercent(undefined)).toBe(DELIVERY_APP_FEE_PERCENT_DEFAULT)
  })

  it("persists zero", () => {
    expect(resolveDeliveryAppFeePercent(0)).toBe(0)
    expect(normalizeDeliveryAppFeePercent(0)).toBe(0)
  })

  it("clamps invalid input", () => {
    expect(normalizeDeliveryAppFeePercent(150)).toBe(100)
    expect(normalizeDeliveryAppFeePercent(-5)).toBe(0)
    expect(normalizeDeliveryAppFeePercent("x")).toBe(DELIVERY_APP_FEE_PERCENT_DEFAULT)
  })
})

describe("mise percent", () => {
  it("preserves an explicit zero loss rate", () => {
    expect(resolveMisePercent(0)).toBe(0)
    expect(resolveMisePercent("0")).toBe(0)
  })

  it("defaults only when unset or invalid", () => {
    expect(resolveMisePercent(null)).toBe(3)
    expect(resolveMisePercent(undefined)).toBe(3)
    expect(resolveMisePercent("")).toBe(3)
    expect(resolveMisePercent("x")).toBe(3)
  })
})
