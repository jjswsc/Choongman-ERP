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
    startStr: "2026-07-01",
    endStr: "2026-07-31",
    selectedStores: ["S1"],
    periodGroup: "month",
    orderTypesKey: "",
    dowsKey: "",
    compareStores: false,
    menuSearch: "",
    menuSearchAnd: false,
    activeSubMenuId: "sales-compare",
    selectedTopicBySubMenu: { "sales-compare": "compare-store-summary" },
    forecastHorizon: "month",
    periodData: [{ label: "2026-07", key: "2026-07", sales: 100 }],
    periodSplitSeries: null,
    periodTruncated: false,
    deliveryAppData: { items: [], total: 0 },
    deliveryAppReconcileData: {
      rows: [],
      kpi: {
        appNetSales: 0,
        deliveryCount: 0,
        inStoreCount: 0,
        deliverySales: 0,
        inStoreSales: 0,
        suggestedFee: 0,
        suggestedPayout: 0,
        bankDepositAmt: 0,
      },
    },
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
  }) as SalesManagementViewCache

describe("sales-management-view-cache", () => {
  beforeEach(() => clearSalesManagementViewCache())

  it("returns snapshot only when analytics key matches if a key is given", () => {
    saveSalesManagementViewCache(emptySnap("k1"))
    expect(readSalesManagementViewCache("k2")).toBeNull()
    expect(readSalesManagementViewCache("k1")?.periodData[0]?.sales).toBe(100)
  })

  it("returns last query without a key so remount can restore filters too", () => {
    saveSalesManagementViewCache(emptySnap("k1"))
    const snap = readSalesManagementViewCache()
    expect(snap?.startStr).toBe("2026-07-01")
    expect(snap?.selectedStores).toEqual(["S1"])
    expect(snap?.activeSubMenuId).toBe("sales-compare")
    expect(snap?.analyticsParamKey).toBe("k1")
  })

  it("does not save a snapshot without analyticsParamKey", () => {
    saveSalesManagementViewCache({ ...emptySnap(""), analyticsParamKey: "" })
    expect(readSalesManagementViewCache()).toBeNull()
  })
})
