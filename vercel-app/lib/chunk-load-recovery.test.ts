import { describe, expect, it } from "vitest"
import { isChunkLoadError, shouldClearBuildRelatedCache } from "@/lib/chunk-load-recovery"

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

describe("shouldClearBuildRelatedCache", () => {
  it("clears next/serwist/workbox caches only", () => {
    expect(shouldClearBuildRelatedCache("next-static-build-assets-v2")).toBe(true)
    expect(shouldClearBuildRelatedCache("serwist-precache-v2-https://example")).toBe(true)
    expect(shouldClearBuildRelatedCache("workbox-precache-v2")).toBe(true)
    expect(shouldClearBuildRelatedCache("pos-warm-get-apis")).toBe(false)
  })
})
