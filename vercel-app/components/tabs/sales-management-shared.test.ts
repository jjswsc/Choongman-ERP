import { describe, expect, it } from "vitest"
import {
  isSalesHeavyTopicSkippedOnLongRange,
  isSalesLongRangeQuery,
  isSalesPeriodGroupAllowedOnLongRange,
  resolveSalesPeriodGroupForFastQuery,
  salesWaterfallGross,
} from "@/components/tabs/sales-management-shared"

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

describe("sales long-range fast query", () => {
  it("treats 31 inclusive days as short and 32 as long", () => {
    expect(isSalesLongRangeQuery("2026-07-01", "2026-07-31")).toBe(false)
    expect(isSalesLongRangeQuery("2026-07-01", "2026-08-01")).toBe(true)
    expect(isSalesLongRangeQuery("2026-06-01", "2026-08-16")).toBe(true)
  })

  it("keeps year/month/week/day/hour/dow on long range", () => {
    expect(isSalesPeriodGroupAllowedOnLongRange("month")).toBe(true)
    expect(isSalesPeriodGroupAllowedOnLongRange("hour")).toBe(true)
    expect(resolveSalesPeriodGroupForFastQuery("hour", true)).toBe("hour")
    expect(resolveSalesPeriodGroupForFastQuery("day", true)).toBe("day")
    expect(resolveSalesPeriodGroupForFastQuery("week", true)).toBe("week")
    expect(resolveSalesPeriodGroupForFastQuery("dow", true)).toBe("dow")
    expect(resolveSalesPeriodGroupForFastQuery("year", true)).toBe("year")
    expect(resolveSalesPeriodGroupForFastQuery("hour", false)).toBe("hour")
  })

  it("skips menu and channel-check topics on long range, not period", () => {
    expect(isSalesHeavyTopicSkippedOnLongRange("menu")).toBe(true)
    expect(isSalesHeavyTopicSkippedOnLongRange("channel-reconcile")).toBe(true)
    expect(isSalesHeavyTopicSkippedOnLongRange("app-reconcile")).toBe(true)
    expect(isSalesHeavyTopicSkippedOnLongRange("period")).toBe(false)
  })
})
