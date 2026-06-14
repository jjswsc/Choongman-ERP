import { describe, expect, it } from "vitest"
import {
  mapShopeeFoodStatusToPosStatus,
  mergeShopeeStateIntoFullMemo,
} from "@/lib/shopeefood-order-status-sync"
import { TAX_INVOICE_MARKER } from "@/lib/pos-tax-invoice"

describe("mapShopeeFoodStatusToPosStatus", () => {
  it("maps cancel variants to cancelled", () => {
    expect(mapShopeeFoodStatusToPosStatus("CANCELLED")).toBe("cancelled")
    expect(mapShopeeFoodStatusToPosStatus("MERCHANT_CANCEL")).toBe("cancelled")
    expect(mapShopeeFoodStatusToPosStatus("REJECTED")).toBe("cancelled")
  })

  it("maps refund to refunded", () => {
    expect(mapShopeeFoodStatusToPosStatus("REFUNDED")).toBe("refunded")
  })

  it("does not auto-complete on delivered", () => {
    expect(mapShopeeFoodStatusToPosStatus("DELIVERED")).toBeNull()
    expect(mapShopeeFoodStatusToPosStatus("COMPLETED")).toBeNull()
  })
})

describe("mergeShopeeStateIntoFullMemo", () => {
  it("preserves tax invoice tail", () => {
    const tail = `${TAX_INVOICE_MARKER}{"name":"x"}`
    const merged = mergeShopeeStateIntoFullMemo(`sf_order:99|sf_state:OLD ${tail}`, "99", "CANCELLED")
    expect(merged.startsWith("sf_order:99|sf_state:CANCELLED")).toBe(true)
    expect(merged.endsWith(tail)).toBe(true)
  })
})
