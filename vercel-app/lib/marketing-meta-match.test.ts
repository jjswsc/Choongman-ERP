import { describe, expect, it } from "vitest"
import { filterAdsForCampaign, materialStatusForColumn, uniqueMetaAdsCampaigns } from "./marketing-meta-match"
import type { MetaAdInsightRow } from "./meta-graph"

describe("filterAdsForCampaign", () => {
  const ads = [
    {
      adId: "1",
      adName: "A",
      campaignId: "c1",
      campaignName: "Summer Mala Boost",
      impressions: 10,
      reach: 8,
      clicks: 1,
      ctr: 0.1,
      spend: 100,
    },
    {
      adId: "2",
      adName: "B",
      campaignId: "c2",
      campaignName: "Other Brand",
      impressions: 5,
      reach: 4,
      clicks: 0,
      ctr: 0,
      spend: 20,
    },
  ]

  it("matches by overlapping topic", () => {
    expect(filterAdsForCampaign(ads, { topic: "Summer Mala" }).map((a) => a.adId)).toEqual(["1"])
  })

  it("uses explicit Meta campaign name", () => {
    expect(filterAdsForCampaign(ads, { topic: "X", metaCampaignName: "Other Brand" }).map((a) => a.adId)).toEqual(["2"])
  })

  it("matches by Meta campaign id", () => {
    expect(filterAdsForCampaign(ads, { metaCampaignId: "c2" }).map((a) => a.adId)).toEqual(["2"])
  })

  it("returns empty when nothing overlaps", () => {
    expect(filterAdsForCampaign(ads, { topic: "Unused name" })).toEqual([])
  })

  it("lists unique Ads Manager campaigns newest first and skips Post titles", () => {
    const mixed: MetaAdInsightRow[] = [
      {
        adId: "1",
        adName: "A",
        campaignId: "120204228099400502",
        campaignName: "การโปรโมท Choongman Thailand ในวันที่ [21/12/2023]",
        impressions: 1,
        reach: 1,
        clicks: 0,
        ctr: 0,
        spend: 10,
      },
      {
        adId: "2",
        adName: "B",
        campaignId: "120204779795250502",
        campaignName: "การโปรโมท Choongman Thailand ในวันที่ [10/1/2024]",
        impressions: 1,
        reach: 1,
        clicks: 0,
        ctr: 0,
        spend: 20,
      },
      {
        adId: "3",
        adName: "C",
        campaignId: "120207857090790502",
        campaignName: 'โพสต์: "CHOONGMAN NO.1"',
        impressions: 1,
        reach: 1,
        clicks: 0,
        ctr: 0,
        spend: 5,
      },
      {
        adId: "4",
        adName: "D",
        campaignId: "c1",
        campaignName: "Summer Mala Boost",
        impressions: 10,
        reach: 8,
        clicks: 1,
        ctr: 0.1,
        spend: 100,
      },
    ]
    expect(uniqueMetaAdsCampaigns(mixed).map((x) => x.id)).toEqual([
      "120204779795250502",
      "120204228099400502",
      "c1",
    ])
    expect(uniqueMetaAdsCampaigns(mixed, { includeOrganicPosts: true }).map((x) => x.id)).toContain(
      "120207857090790502"
    )
  })
})

describe("kanban status map", () => {
  it("maps columns to material status", () => {
    expect(materialStatusForColumn("todo")).toBe("planning")
    expect(materialStatusForColumn("doing")).toBe("producing")
    expect(materialStatusForColumn("done")).toBe("distributed")
  })
})
