import { describe, expect, it } from "vitest"
import { shouldReuseKeepAliveCacheEntry } from "./erp-keep-alive-cache"

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
