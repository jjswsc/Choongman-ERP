import { afterEach, describe, expect, it, vi } from "vitest"
import {
  CHUNK_RECOVERY_UI_WATCHDOG_MS,
  didHybridCacheResetReload,
  hasHybridSilentCacheReset,
  HYBRID_CACHE_RESET_WAIT_MS,
  isChunkLoadError,
  isStaleClientBundleError,
  recoverFromChunkLoadError,
  shouldClearBuildRelatedCache,
  shouldRecoverStaleBundleEvent,
} from "@/lib/chunk-load-recovery"

describe("isChunkLoadError", () => {
  it("matches webpack retry plugin message with undefined hash", () => {
    expect(
      isChunkLoadError(
        new Error("Loading chunk 64807 failed after 3 retries. (static/chunks/64807.undefined.js)")
      )
    ).toBe(true)
  })

  it("matches ChunkLoadError name", () => {
    const err = new Error("Loading CSS chunk 12 failed")
    err.name = "ChunkLoadError"
    expect(isChunkLoadError(err)).toBe(true)
  })

  it("ignores unrelated errors", () => {
    expect(isChunkLoadError(new Error("Network request failed"))).toBe(false)
  })
})

describe("isStaleClientBundleError", () => {
  it("treats minified .map TypeError as stale bundle", () => {
    expect(isStaleClientBundleError(new Error("eo.map is not a function"))).toBe(true)
    expect(isStaleClientBundleError(new TypeError("x.filter is not a function"))).toBe(true)
  })

  it("treats webpack missing named export as stale bundle", () => {
    expect(
      isStaleClientBundleError(
        new TypeError("(0 , a.allocateLineDiscountByAssignedQty) is not a function")
      )
    ).toBe(true)
  })

  it("includes chunk load errors", () => {
    expect(isStaleClientBundleError(new Error("Loading chunk 1 failed"))).toBe(true)
  })

  it("ignores unrelated errors", () => {
    expect(isStaleClientBundleError(new Error("Network request failed"))).toBe(false)
  })
})

describe("shouldRecoverStaleBundleEvent", () => {
  it("recovers chunk errors unless a recovery already ran", () => {
    expect(shouldRecoverStaleBundleEvent(new Error("Loading chunk 1 failed"), false)).toBe(true)
    expect(shouldRecoverStaleBundleEvent(new Error("Loading chunk 1 failed"), true)).toBe(false)
    expect(shouldRecoverStaleBundleEvent(new Error("Network request failed"), false)).toBe(false)
  })
})

describe("shouldClearBuildRelatedCache", () => {
  it("clears next/serwist/workbox caches only", () => {
    expect(shouldClearBuildRelatedCache("next-static-build-assets-v3")).toBe(true)
    expect(shouldClearBuildRelatedCache("next-static-build-assets-v2")).toBe(true)
    expect(shouldClearBuildRelatedCache("serwist-precache-v2-https://example")).toBe(true)
    expect(shouldClearBuildRelatedCache("workbox-precache-v2")).toBe(true)
    expect(shouldClearBuildRelatedCache("pos-warm-get-apis")).toBe(false)
  })
})

describe("CHUNK_RECOVERY_UI_WATCHDOG_MS", () => {
  it("gives stores a way out of the loading screen", () => {
    expect(CHUNK_RECOVERY_UI_WATCHDOG_MS).toBe(5_000)
    expect(HYBRID_CACHE_RESET_WAIT_MS).toBeLessThan(CHUNK_RECOVERY_UI_WATCHDOG_MS)
  })
})

describe("didHybridCacheResetReload", () => {
  it("treats ok:true as a completed reload", () => {
    expect(didHybridCacheResetReload({ ok: true })).toBe(true)
    expect(didHybridCacheResetReload({ ok: false, reason: "busy" })).toBe(false)
    expect(didHybridCacheResetReload({ ok: false, reason: "timeout" })).toBe(false)
    expect(didHybridCacheResetReload(undefined)).toBe(false)
  })
})

describe("recoverFromChunkLoadError", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("uses silent hybrid Clear Cache when the Windows POS shell is present", async () => {
    const resetCacheAndReload = vi.fn(async () => ({ ok: true }))
    const replace = vi.fn()
    vi.stubGlobal("window", {
      cmPosShell: { resetCacheAndReload },
      location: {
        href: "https://x.example/pos",
        origin: "https://x.example",
        replace,
      },
    })
    expect(hasHybridSilentCacheReset({ resetCacheAndReload })).toBe(true)
    await recoverFromChunkLoadError()
    expect(resetCacheAndReload).toHaveBeenCalledWith({ silent: true })
    expect(replace).not.toHaveBeenCalled()
  })

  it("falls through to a hard refresh when hybrid Clear Cache is busy", async () => {
    const resetCacheAndReload = vi.fn(async () => ({ ok: false, reason: "busy" }))
    const replace = vi.fn()
    vi.stubGlobal("window", {
      cmPosShell: { resetCacheAndReload },
      location: {
        href: "https://x.example/pos",
        origin: "https://x.example",
        replace,
      },
    })
    await recoverFromChunkLoadError()
    expect(replace).toHaveBeenCalledTimes(1)
    expect(String(replace.mock.calls[0]?.[0] ?? "")).toContain("_refresh=")
  })

  it("falls through when hybrid Clear Cache hangs past the wait", async () => {
    vi.useFakeTimers()
    const resetCacheAndReload = vi.fn(() => new Promise(() => {}))
    const replace = vi.fn()
    vi.stubGlobal("window", {
      cmPosShell: { resetCacheAndReload },
      location: {
        href: "https://x.example/pos",
        origin: "https://x.example",
        replace,
      },
    })
    const pending = recoverFromChunkLoadError()
    await vi.advanceTimersByTimeAsync(HYBRID_CACHE_RESET_WAIT_MS)
    await pending
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it("navigates immediately even if service worker unregister hangs", async () => {
    const replace = vi.fn()
    vi.stubGlobal("window", {
      location: {
        href: "https://x.example/pos/login",
        origin: "https://x.example",
        replace,
      },
    })
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistrations: () => new Promise(() => {}),
      },
    })
    await recoverFromChunkLoadError()
    expect(replace).toHaveBeenCalledTimes(1)
    expect(String(replace.mock.calls[0]?.[0] ?? "")).toContain("_refresh=")
  })
})
