import { describe, expect, it } from "vitest"
import { filterAdsForCampaign, materialStatusForColumn, uniqueMetaAdsCampaigns } from "./marketing-meta-match"

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

  it("lists unique Ads Manager campaigns", () => {
    expect(uniqueMetaAdsCampaigns(ads)).toEqual([
      { id: "c1", name: "Summer Mala Boost" },
      { id: "c2", name: "Other Brand" },
    ])
  })
})

describe("kanban status map", () => {
  it("maps columns to material status", () => {
    expect(materialStatusForColumn("todo")).toBe("planning")
    expect(materialStatusForColumn("doing")).toBe("producing")
    expect(materialStatusForColumn("done")).toBe("distributed")
  })
})
