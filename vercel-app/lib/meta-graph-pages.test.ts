import { afterEach, describe, expect, it, vi } from "vitest"
import { metaGraphGetAllPages } from "./meta-graph"

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe("metaGraphGetAllPages", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("follows paging.next so campaigns after the first page are kept", async () => {
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (!url.includes("after=")) {
        return jsonResponse({
          data: [{ id: "old", name: "[8/8/2025] Promoting" }],
          paging: { next: "https://graph.facebook.com/v21.0/act_1/campaigns?after=CURSOR2&limit=100" },
        }) as Response
      }
      return jsonResponse({
        data: [{ id: "y2026", name: "New Menu", created_time: "2026-09-01T00:00:00+0700" }],
      }) as Response
    }) as typeof fetch

    const page = await metaGraphGetAllPages<{ id: string }>("act_1/campaigns", "token", { limit: "100" })
    expect(page.ok).toBe(true)
    expect(page.pages).toBe(2)
    expect(page.truncated).toBe(false)
    expect(page.data.map((row) => row.id)).toEqual(["old", "y2026"])
    expect(urls[1]).toContain("after=CURSOR2")
    expect(urls[1]).not.toContain("access_token")
  })
})