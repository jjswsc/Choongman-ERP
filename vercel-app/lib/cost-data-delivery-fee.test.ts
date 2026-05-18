import { describe, expect, it } from "vitest"
import {
  DELIVERY_APP_FEE_PERCENT_DEFAULT,
  normalizeDeliveryAppFeePercent,
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
