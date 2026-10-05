import { afterEach, describe, expect, it, vi } from "vitest"
import {
  appendMetaCampaignCatalog,
  metaGraphGetAllPages,
  yearsCoveredByMetaRange,
  type MetaAdInsightRow,
} from "./meta-graph"

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe("yearsCoveredByMetaRange", () => {
  it("maps last_28d around Bangkok today into the current year", () => {
    expect(yearsCoveredByMetaRange({ preset: "last_28d", todayYmd: "2026-10-05" })).toEqual([2026])
    expect(yearsCoveredByMetaRange({ since: "2025-12-20", until: "2026-01-10" })).toEqual([2025, 2026])
  })
})

describe("appendMetaCampaignCatalog", () => {
  it("adds a 2026 campaign without changing spend already stored", () => {
    const ads: MetaAdInsightRow[] = [
      {
        adId: "a",
        adName: "old",
        campaignId: "old",
        campaignName: "[8/8/2025] Promoting",
        impressions: 3,
        reach: 2,
        clicks: 1,
        ctr: 0.1,
        spend: 40,
      },
    ]
    const added = appendMetaCampaignCatalog(ads, [
      { id: "old", name: "[8/8/2025] Promoting", created_time: "2025-08-08T00:00:00+0700" },
      { id: "y2026", name: "New Menu", created_time: "2026-03-01T00:00:00+0700" },
    ])
    expect(added).toBe(1)
    expect(ads.find((a) => a.campaignId === "old")?.spend).toBe(40)
    expect(ads.find((a) => a.campaignId === "old")?.createdTime).toBe("2025-08-08T00:00:00+0700")
    expect(ads.find((a) => a.campaignId === "y2026")?.campaignName).toBe("New Menu")
  })
})

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