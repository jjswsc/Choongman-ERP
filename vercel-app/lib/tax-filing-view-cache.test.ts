import { describe, expect, it } from "vitest"
import type { TaxBookEntriesResponse, TaxManagementBridgeResponse } from "@/lib/api-client/tax-book"
import {
  clearTaxFilingViewCache,
  patchTaxFilingViewCache,
  readTaxBooksResultCache,
  readTaxFilingViewCache,
  shouldReuseRestoredTaxBooksSearch,
  taxFilingSearchTickOr,
  taxFilingYearMonthOr,
} from "./tax-filing-view-cache"

describe("tax-filing-view-cache", () => {
  it("keeps loaded books when later patches only update filters", () => {
    clearTaxFilingViewCache()
    expect(readTaxFilingViewCache()).toBeNull()
    patchTaxFilingViewCache({
      tab: "books",
      booksFromMonth: "2026-01",
      booksToMonth: "2026-06",
      booksScope: "entity:act",
      booksSearchTick: 2,
    })
    patchTaxFilingViewCache({
      booksResult: {
        view: "ledger",
        query: { from: "2026-01", to: "2026-06", scope: "entity:act", tick: 2 },
        bridge: { yearMonth: "2026-06" } as TaxManagementBridgeResponse,
        entries: { schemaReady: true, vouchers: [], ledger: [], trial: [] } as TaxBookEntriesResponse,
        ledgerDraft: {
          dateFrom: "2026-01-01",
          dateTo: "2026-06-30",
          accountFrom: "11111",
          accountTo: "59995",
          allBusiness: false,
        },
        ledgerApplied: {
          dateFrom: "2026-01-01",
          dateTo: "2026-06-30",
          accountFrom: "11111",
          accountTo: "59995",
          allBusiness: false,
        },
        dayBook: "sales",
        voucherDateQuery: "",
        voucherDocQuery: "IV",
      },
    })
    patchTaxFilingViewCache({ booksScope: "entity:sj", tab: "pp30" })

    const snap = readTaxFilingViewCache()
    expect(snap?.tab).toBe("pp30")
    expect(snap?.booksScope).toBe("entity:sj")
    expect(snap?.booksSearchTick).toBe(2)
    const books = readTaxBooksResultCache()
    expect(books?.view).toBe("ledger")
    expect(books?.query.scope).toBe("entity:act")
    expect(books?.voucherDocQuery).toBe("IV")
  })

  it("reuses the restored search only when the tick still matches", () => {
    expect(shouldReuseRestoredTaxBooksSearch(3, 3)).toBe(true)
    expect(shouldReuseRestoredTaxBooksSearch(3, 4)).toBe(false)
    expect(shouldReuseRestoredTaxBooksSearch(0, 0)).toBe(false)
    expect(shouldReuseRestoredTaxBooksSearch(null, 1)).toBe(false)
    expect(taxFilingYearMonthOr("2026-6", "2026-06")).toBe("2026-06")
    expect(taxFilingYearMonthOr("2026-06", "2026-01")).toBe("2026-06")
    expect(taxFilingSearchTickOr(1.9)).toBe(1)
  })
})
