import { describe, expect, it } from "vitest"
import { isCacheableNextStaticAssetResponse } from "@/lib/next-static-asset-cache"

function res(status: number, contentType: string | null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) },
  }
}

describe("isCacheableNextStaticAssetResponse", () => {
  it("caches successful javascript and css", () => {
    expect(isCacheableNextStaticAssetResponse(res(200, "application/javascript; charset=utf-8"))).toBe(true)
    expect(isCacheableNextStaticAssetResponse(res(200, "text/css"))).toBe(true)
    expect(isCacheableNextStaticAssetResponse(res(200, "application/octet-stream"))).toBe(true)
    expect(isCacheableNextStaticAssetResponse(res(200, ""))).toBe(true)
  })

  it("rejects html/json error bodies even with 200", () => {
    expect(isCacheableNextStaticAssetResponse(res(200, "text/html; charset=utf-8"))).toBe(false)
    expect(isCacheableNextStaticAssetResponse(res(200, "application/json"))).toBe(false)
    expect(isCacheableNextStaticAssetResponse(res(200, "text/plain"))).toBe(false)
  })

  it("rejects non-200", () => {
    expect(isCacheableNextStaticAssetResponse(res(404, "application/javascript"))).toBe(false)
    expect(isCacheableNextStaticAssetResponse(res(503, "text/html"))).toBe(false)
    expect(isCacheableNextStaticAssetResponse(null)).toBe(false)
  })
})
