import { describe, expect, it } from "vitest"
import { salesWaterfallGross } from "@/components/tabs/sales-management-shared"

describe("salesWaterfallGross", () => {
  it("equals net sales after subtracting discount and service (VAT-included identity)", () => {
    // 2026-07-10 관측: 순매출 357191, 할인 21289, 서비스 249
    // 잘못된 subtotal+vat(=401535)가 아니라 total+discount+service
    const total = 357_191
    const discount = 21_289
    const service = 249
    const gross = salesWaterfallGross({ total, discount, service })
    expect(gross).toBe(378_729)
    expect(gross - discount - service).toBe(total)
  })

  it("does not add VAT on top of inclusive totals", () => {
    const inclusiveSubtotal = 378_729
    const vatBreakdown = 22_806
    const wrongGross = inclusiveSubtotal + vatBreakdown
    const correct = salesWaterfallGross({
      total: 357_191,
      discount: 21_289,
      service: 249,
    })
    expect(correct).toBe(inclusiveSubtotal)
    expect(correct).not.toBe(wrongGross)
  })
})
