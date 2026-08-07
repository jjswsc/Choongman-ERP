import { describe, expect, it, beforeEach } from "vitest"
import {
  clearSalesManagementViewCache,
  readSalesManagementViewCache,
  saveSalesManagementViewCache,
  type SalesManagementViewCache,
} from "./sales-management-view-cache"

const emptySnap = (key: string): SalesManagementViewCache =>
  ({
    analyticsParamKey: key,
    periodData: [{ label: "2026-07", key: "2026-07", sales: 100 }],
    periodSplitSeries: null,
    periodTruncated: false,
    deliveryAppData: { items: [], total: 0 },
    channelData: [],
    menuData: [],
    promoBundleData: {
      bundles: [],
      lines: [],
      summary: { orderCount: 0, discountTotal: 0, lineCount: 0 },
    },
    paymentData: [],
    paymentBreakdownData: {
      deliveryByChannel: [],
      deliveryTotal: 0,
      creditByChannel: [],
      creditTotal: 0,
      summary: [],
    },
    storeData: [],
    yoyCompareRows: [],
    momCompareRows: [],
    forecastSummary: null,
    forecastLookbackRows: [],
    forecastActualRows: [],
    summaryCards: { current: 100, prevRange: 0, prevWeek: 0 },
    cancelReasonSummary: {
      lineRows: [],
      orderRows: [],
      lineTotalCount: 0,
      lineTotalAmount: 0,
      orderTotalCount: 0,
      orderTotalAmount: 0,
      truncated: false,
    },
  }) as SalesManagementViewCache

describe("sales-management-view-cache", () => {
  beforeEach(() => clearSalesManagementViewCache())

  it("returns snapshot only when analytics key matches", () => {
    saveSalesManagementViewCache(emptySnap("k1"))
    expect(readSalesManagementViewCache("k2")).toBeNull()
    expect(readSalesManagementViewCache("k1")?.periodData[0]?.sales).toBe(100)
  })
})
