import { describe, expect, it } from "vitest"
import {
  computePurchaseOrderMoneyTotals,
} from "./purchase-order-cart"
import {
  thaiInvoiceTotalsFromVatInclusiveGrand,
  vatExclusiveUnitFromInclusiveUnit,
} from "./invoice-vat-total"

describe("thaiInvoiceTotalsFromVatInclusiveGrand (FlowAccount)", () => {
  it("Silom tax invoice: inclusive 16940 → excl 15831.78 + VAT 1108.22", () => {
    const t = thaiInvoiceTotalsFromVatInclusiveGrand(16940)
    expect(t.grandTotal).toBe(16940)
    expect(t.vatRounded).toBe(1108.22)
    expect(t.subtotalRounded).toBe(15831.78)
  })
})

describe("vatExclusiveUnitFromInclusiveUnit (FlowAccount line)", () => {
  it("converts Silom lines so PO totals match 16940 (not 16940.03)", () => {
    const u249 = vatExclusiveUnitFromInclusiveUnit(249, 30)
    const u100 = vatExclusiveUnitFromInclusiveUnit(100, 20)
    const totals = computePurchaseOrderMoneyTotals([
      { price: u249, qty: 30, taxType: "taxable" },
      { price: u249, qty: 30, taxType: "taxable" },
      { price: u100, qty: 20, taxType: "taxable" },
    ])
    expect(totals.subtotal).toBeCloseTo(15831.78, 2)
    expect(totals.vat).toBeCloseTo(1108.22, 2)
    expect(totals.total).toBeCloseTo(16940, 2)
  })

  it("unit-first round(price/1.07) would drift — document why line-total method exists", () => {
    const bad = Math.round((249 / 1.07) * 100) / 100
    const badOnion = Math.round((100 / 1.07) * 100) / 100
    const drifted = computePurchaseOrderMoneyTotals([
      { price: bad, qty: 30, taxType: "taxable" },
      { price: bad, qty: 30, taxType: "taxable" },
      { price: badOnion, qty: 20, taxType: "taxable" },
    ])
    expect(drifted.total).toBeCloseTo(16940.03, 2)
  })
})
