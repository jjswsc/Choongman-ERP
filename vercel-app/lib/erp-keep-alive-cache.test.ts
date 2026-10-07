import { describe, expect, it } from "vitest"
import {
  advanceKeepAliveSlotUrl,
  resolveKeepAliveSlotFullHref,
  shouldReuseKeepAliveCacheEntry,
} from "./erp-keep-alive-cache"

describe("shouldReuseKeepAliveCacheEntry", () => {
  it("reuses when returning from another cached page", () => {
    expect(shouldReuseKeepAliveCacheEntry("/admin/vendors", "/admin/items", true)).toBe(true)
  })

  it("reuses on same-page re-render when stamp still matches (keeps search state)", () => {
    expect(shouldReuseKeepAliveCacheEntry("/admin/items", "/admin/items", true)).toBe(true)
  })

  it("does not reuse on first visit", () => {
    expect(shouldReuseKeepAliveCacheEntry(null, "/admin/items", false)).toBe(false)
  })

  it("does not reuse when cache was evicted or remount stamp changed", () => {
    expect(shouldReuseKeepAliveCacheEntry("/admin/vendors", "/admin/items", false)).toBe(false)
  })
})

describe("resolveKeepAliveSlotFullHref", () => {
  it("keeps the stored query when the slot is hidden", () => {
    expect(
      resolveKeepAliveSlotFullHref({
        storedFullHref: "/admin/stock?store=CM%20Silom&asOf=2026-06-30",
        liveHref: "/admin/vendors?q=acme",
        slotIsLive: false,
      })
    ).toBe("/admin/stock?store=CM%20Silom&asOf=2026-06-30")
  })

  it("follows the live href only for the visible slot", () => {
    expect(
      resolveKeepAliveSlotFullHref({
        storedFullHref: "/admin/stock?store=CM%20Silom",
        liveHref: "/admin/stock?store=CM%20Rama9",
        slotIsLive: true,
      })
    ).toBe("/admin/stock?store=CM%20Rama9")
  })

  it("keeps the stored query on a visible slot while hold is on", () => {
    expect(
      resolveKeepAliveSlotFullHref({
        storedFullHref: "/admin/tax-filing?tab=purchaseTaxInv",
        liveHref: "/admin/tax-filing",
        slotIsLive: true,
        holdStoredQuery: true,
      })
    ).toBe("/admin/tax-filing?tab=purchaseTaxInv")
  })
})

describe("advanceKeepAliveSlotUrl", () => {
  const stored = "/admin/bank-transactions?tab=query&accountId=12"

  it("holds the queried URL when returning from another menu with no query", () => {
    expect(
      advanceKeepAliveSlotUrl({
        storedFullHref: stored,
        liveHref: "/admin/bank-transactions",
        holdStoredQuery: false,
        returningFromOtherPage: true,
      })
    ).toEqual({ fullHref: stored, holdStoredQuery: true })
  })

  it("keeps holding on the next render while the router URL is still bare", () => {
    expect(
      advanceKeepAliveSlotUrl({
        storedFullHref: stored,
        liveHref: "/admin/bank-transactions",
        holdStoredQuery: true,
        returningFromOtherPage: false,
      })
    ).toEqual({ fullHref: stored, holdStoredQuery: true })
  })

  it("adopts a deep link when returning with a query", () => {
    const live = "/admin/bank-transactions?tab=query&openRegisterTxId=9"
    expect(
      advanceKeepAliveSlotUrl({
        storedFullHref: stored,
        liveHref: live,
        holdStoredQuery: true,
        returningFromOtherPage: true,
      })
    ).toEqual({ fullHref: live, holdStoredQuery: false })
  })

  it("follows query edits made while staying on the page", () => {
    const live = "/admin/expense-management?tab=expenseSearch&startStr=2026-06-01"
    expect(
      advanceKeepAliveSlotUrl({
        storedFullHref: "/admin/expense-management?tab=plan",
        liveHref: live,
        holdStoredQuery: false,
        returningFromOtherPage: false,
      })
    ).toEqual({ fullHref: live, holdStoredQuery: false })
  })
})
