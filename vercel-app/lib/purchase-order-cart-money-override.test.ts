import { describe, expect, it } from "vitest"
import {
  normalizePoMoneyOverride,
  resolvePurchaseOrderMoneyTotals,
} from "./purchase-order-cart"

describe("normalizePoMoneyOverride", () => {
  it("accepts FlowAccount-style rounded totals", () => {
    const ov = normalizePoMoneyOverride({
      subtotal: 15831.78,
      vat: 1108.22,
      total: 16940,
    })
    expect(ov).toEqual({ subtotal: 15831.78, vat: 1108.22, total: 16940 })
  })

  it("rejects when subtotal+vat diverges from total", () => {
    expect(
      normalizePoMoneyOverride({
        subtotal: 15831.8,
        vat: 1108.23,
        total: 16940,
      })
    ).toBeNull()
  })
})

describe("resolvePurchaseOrderMoneyTotals", () => {
  it("uses line math unless override is set", () => {
    const lines = [
      { price: 232.71, qty: 30, taxType: "taxable" },
      { price: 232.71, qty: 30, taxType: "taxable" },
      { price: 93.46, qty: 20, taxType: "taxable" },
    ]
    const auto = resolvePurchaseOrderMoneyTotals(lines)
    expect(auto.overridden).toBe(false)
    expect(auto.subtotal).toBeCloseTo(15831.8, 2)
    expect(auto.vat).toBeCloseTo(1108.23, 2)
    expect(auto.total).toBeCloseTo(16940.03, 2)

    const withOv = resolvePurchaseOrderMoneyTotals(lines, {
      subtotal: 15831.78,
      vat: 1108.22,
      total: 16940,
    })
    expect(withOv.overridden).toBe(true)
    expect(withOv.subtotal).toBe(15831.78)
    expect(withOv.vat).toBe(1108.22)
    expect(withOv.total).toBe(16940)
  })
})
