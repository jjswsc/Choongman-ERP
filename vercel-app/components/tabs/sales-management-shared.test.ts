import { describe, expect, it } from "vitest"
import {
  formatSalesAmount,
  isSalesHeavyTopicSkippedOnLongRange,
  isSalesLongRangeQuery,
  isSalesPeriodGroupAllowedOnLongRange,
  resolveDefaultSalesLanding,
  resolveSalesPeriodGroupForFastQuery,
  salesWaterfallGross,
  sumDisplayedSalesAmounts,
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

describe("resolveDefaultSalesLanding", () => {
  it("defaults admin and mobile store-sales to store summary pivot", () => {
    expect(resolveDefaultSalesLanding("/admin/sales-management")).toEqual({
      menuId: "sales-compare",
      topicId: "compare-store-summary",
      periodGroup: "month",
    })
    expect(resolveDefaultSalesLanding("/store-sales")).toEqual({
      menuId: "sales-compare",
      topicId: "compare-store-summary",
      periodGroup: "month",
    })
  })

  it("keeps other paths on period analysis", () => {
    expect(resolveDefaultSalesLanding("/pos/sales")).toEqual({
      menuId: "sales-analysis",
      topicId: "analysis-period",
      periodGroup: "day",
    })
  })
})

describe("sumDisplayedSalesAmounts", () => {
  it("ties out integer rows: total equals sum of independently rounded lines (Silom 1฿)", () => {
    // 화면은 행마다 Math.round. 세 행이 *.6이면 표시 합 33, 합 후 반올림은 32.
    const rows = [{ sales: 10.6 }, { sales: 10.6 }, { sales: 10.6 }]
    expect(sumDisplayedSalesAmounts(rows)).toBe(33)
    expect(formatSalesAmount(sumDisplayedSalesAmounts(rows))).toBe("33")
    expect(formatSalesAmount(rows.reduce((a, r) => a + r.sales, 0))).toBe("32")
  })

  it("Silom credit card table: displayed lines 463,712 not 463,711", () => {
    const rows = [
      { sales: 162_922.6 },
      { sales: 126_083.6 },
      { sales: 113_371.6 },
      { sales: 37_294 },
      { sales: 14_513 },
      { sales: 5_792 },
      { sales: 2_246 },
      { sales: 990 },
      { sales: 498 },
    ]
    expect(rows.map((r) => Math.round(r.sales)).reduce((a, n) => a + n, 0)).toBe(463_712)
    expect(Math.round(rows.reduce((a, r) => a + r.sales, 0))).toBe(463_711)
    expect(sumDisplayedSalesAmounts(rows)).toBe(463_712)
  })
})
