import { describe, expect, it } from "vitest"
import {
  appendTikTokCampaignCatalog,
  filterTikTokAdsForCampaign,
  filterTikTokCampaignOptions,
  parseTikTokCampaignLinks,
  serializeTikTokCampaignLinks,
  uniqueTikTokAdsCampaigns,
} from "./marketing-tiktok-match"
import type { TikTokAdInsightRow } from "./tiktok-ads"

const sampleAds: TikTokAdInsightRow[] = [
  {
    adId: "a1",
    adName: "Ad 1",
    campaignId: "tt-c1",
    campaignName: "Summer Boost 2026",
    impressions: 100,
    reach: 80,
    clicks: 10,
    ctr: 1,
    spend: 50,
    createdTime: "2026-03-01T00:00:00Z",
  },
  {
    adId: "a2",
    adName: "Ad 2",
    campaignId: "tt-c2",
    campaignName: "Brand Always On",
    impressions: 20,
    reach: 15,
    clicks: 2,
    ctr: 0.5,
    spend: 12,
  },
]

describe("tiktok campaign link serialize", () => {
  it("round-trips single and multi links", () => {
    expect(serializeTikTokCampaignLinks([{ id: "1", name: "A" }])).toEqual({ id: "1", name: "A" })
    const multi = serializeTikTokCampaignLinks([
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ])
    expect(parseTikTokCampaignLinks(multi.id, multi.name)).toEqual([
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ])
  })
})

describe("filterTikTokAdsForCampaign", () => {
  it("filters by mapped campaign id", () => {
    expect(
      filterTikTokAdsForCampaign(sampleAds, { tiktokCampaignId: "tt-c2" }).map((a) => a.adId)
    ).toEqual(["a2"])
  })

  it("supports multi-link OR", () => {
    const packed = serializeTikTokCampaignLinks([
      { id: "tt-c1", name: "Summer Boost 2026" },
      { id: "tt-c2", name: "Brand Always On" },
    ])
    expect(
      filterTikTokAdsForCampaign(sampleAds, {
        tiktokCampaignId: packed.id,
        tiktokCampaignName: packed.name,
      }).map((a) => a.adId)
    ).toEqual(["a1", "a2"])
  })
})

describe("uniqueTikTokAdsCampaigns", () => {
  it("dedupes by campaign id and keeps year from createdTime", () => {
    const opts = uniqueTikTokAdsCampaigns(sampleAds)
    expect(opts.map((o) => o.id)).toEqual(["tt-c2", "tt-c1"])
    expect(opts.find((o) => o.id === "tt-c1")?.years).toContain(2026)
  })

  it("includes catalog-only rows", () => {
    const ads = [...sampleAds]
    appendTikTokCampaignCatalog(ads, [
      { campaignId: "tt-c9", campaignName: "Paused Legacy 2025", createdTime: "1735689600" },
    ])
    const opts = uniqueTikTokAdsCampaigns(ads)
    expect(opts.some((o) => o.id === "tt-c9")).toBe(true)
  })
})

describe("filterTikTokCampaignOptions", () => {
  it("filters by year and query", () => {
    const all = uniqueTikTokAdsCampaigns(sampleAds)
    expect(filterTikTokCampaignOptions(all, { year: 2026 }).map((o) => o.id)).toEqual(["tt-c1"])
    expect(filterTikTokCampaignOptions(all, { query: "brand" }).map((o) => o.id)).toEqual(["tt-c2"])
  })
})
