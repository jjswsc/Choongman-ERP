import { beforeEach, describe, expect, it } from "vitest"
import {
  clearPurchaseOrderViewCache,
  patchPurchaseOrderViewCache,
  readPurchaseOrderViewCache,
} from "./purchase-order-view-cache"

describe("purchase-order-view-cache", () => {
  beforeEach(() => clearPurchaseOrderViewCache())

  it("saves and reads history snapshot", () => {
    patchPurchaseOrderViewCache({
      tab: "history",
      startDate: "2026-07-17",
      endDate: "2026-08-17",
      vendorFilter: "V1",
      sourceFilter: "accounting",
      searchText: "silom",
      hasSearched: true,
      list: [{ id: 11, po_no: "PO-11" }],
    })
    const snap = readPurchaseOrderViewCache()
    expect(snap?.hasSearched).toBe(true)
    expect(snap?.tab).toBe("history")
    expect(snap?.list[0]?.po_no).toBe("PO-11")
    expect(snap?.searchText).toBe("silom")
  })

  it("merges patches so tab save does not wipe history", () => {
    patchPurchaseOrderViewCache({
      hasSearched: true,
      list: [{ id: 2, po_no: "PO-2" }],
      searchText: "abc",
    })
    patchPurchaseOrderViewCache({ tab: "billing_settings" })
    const snap = readPurchaseOrderViewCache()
    expect(snap?.tab).toBe("billing_settings")
    expect(snap?.hasSearched).toBe(true)
    expect(snap?.list[0]?.po_no).toBe("PO-2")
    expect(snap?.searchText).toBe("abc")
  })
})
