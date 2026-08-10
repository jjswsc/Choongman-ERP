import { describe, expect, it, beforeEach } from "vitest"
import {
  clearStockStatusViewCache,
  readStockStatusViewCache,
  saveStockStatusViewCache,
} from "./stock-status-view-cache"
import {
  clearOutboundViewCache,
  readOutboundViewCache,
  saveOutboundViewCache,
} from "./outbound-view-cache"

describe("stock-status-view-cache", () => {
  beforeEach(() => clearStockStatusViewCache())

  it("saves and reads snapshot", () => {
    saveStockStatusViewCache({
      storeFilter: "CM Silom",
      stockDateFilter: "2026-08-10",
      categoryFilter: "",
      purchaseSourceFilter: "",
      searchTerm: "",
      list: [{ code: "A1", name: "Item", spec: "", qty: 2, safeQty: 0, store: "CM Silom", price: 0, cost: 0 }],
      hasSearched: true,
      activeTab: "list",
    })
    expect(readStockStatusViewCache()?.list[0]?.code).toBe("A1")
  })
})

describe("outbound-view-cache", () => {
  beforeEach(() => clearOutboundViewCache())

  it("saves and reads history snapshot", () => {
    saveOutboundViewCache({
      tabValue: "hist",
      histStart: "2026-08-01",
      histEnd: "2026-08-10",
      histMonth: "2026-08",
      histStore: "",
      histTargetType: "",
      histType: "",
      histDeliveryStatus: "",
      invoiceSearch: "",
      itemSearch: "",
      historyList: [{ id: 1 } as never],
      usageList: [],
      historyHasQueried: true,
      summaryList: [],
      summaryHasQueried: false,
      summaryVendorFilter: "",
      summaryCategoryFilter: "",
      summaryMenuSearch: "",
      summaryStoreFilter: "",
      whStart: "2026-08-01",
      whEnd: "2026-08-10",
      whFilterBy: "delivery",
      whData: null,
      whHasQueried: false,
      whWarehouseFilter: "",
      whStoreFilter: "",
      whItemFilter: "",
    })
    expect(readOutboundViewCache()?.historyHasQueried).toBe(true)
    expect(readOutboundViewCache()?.histMonth).toBe("2026-08")
  })
})
