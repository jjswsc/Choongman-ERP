import { describe, expect, it } from "vitest"
import {
  filterAdsForCampaign,
  filterMetaCampaignOptions,
  materialStatusForColumn,
  metaCampaignPickerInitialView,
  metaCampaignYear,
  parseMetaPromoDateMs,
  uniqueMetaAdsCampaigns,
} from "./marketing-meta-match"
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

  it("reads US month/day names and created_time as a year", () => {
    expect(new Date(parseMetaPromoDateMs("[11/27/2023] Promoting") || 0).getUTCMonth()).toBe(10)
    expect(metaCampaignYear("[11/27/2023] Promoting")).toBe(2023)
    expect(metaCampaignYear("Instagram Upgrade Taste", "2026-03-02T10:00:00+0700")).toBe(2026)
  })

  it("filters the campaign list by year, name, and id", () => {
    const options = uniqueMetaAdsCampaigns(
      [
        {
          adId: "",
          adName: "",
          campaignId: "old",
          campaignName: "การโปรโมท Choongman Thailand ในวันที่ [8/8/2025]",
          impressions: 0,
          reach: 0,
          clicks: 0,
          ctr: 0,
          spend: 0,
        },
        {
          adId: "",
          adName: "",
          campaignId: "new2026",
          campaignName: "New Menu Bangkok",
          impressions: 0,
          reach: 0,
          clicks: 0,
          ctr: 0,
          spend: 0,
          createdTime: "2026-09-01T00:00:00+0700",
        },
        {
          adId: "",
          adName: "",
          campaignId: "post1",
          campaignName: 'โพสต์: "2026 lunch"',
          impressions: 0,
          reach: 0,
          clicks: 0,
          ctr: 0,
          spend: 0,
          createdTime: "2026-09-02T00:00:00+0700",
        },
      ],
      { includeOrganicPosts: true }
    )
    expect(filterMetaCampaignOptions(options, { year: 2026 }).map((o) => o.id)).toEqual(["new2026"])
    expect(filterMetaCampaignOptions(options, { year: 2026, includeOrganicPosts: true }).map((o) => o.id)).toEqual([
      "new2026",
      "post1",
    ])
    expect(filterMetaCampaignOptions(options, { query: "new2026", includeOrganicPosts: true }).map((o) => o.id)).toEqual([
      "new2026",
    ])
    expect(filterMetaCampaignOptions(options, { query: "choongman" }).map((o) => o.id)).toEqual(["old"])
  })

  it("lists a 2026 campaign whose title still says 2025", () => {
    const options = uniqueMetaAdsCampaigns(
      [
        {
          adId: "",
          adName: "",
          campaignId: "seoul",
          campaignName: "การโปรโมท Choongman Thailand ในวันที่ [8/8/2025]",
          impressions: 0,
          reach: 0,
          clicks: 0,
          ctr: 0,
          spend: 0,
          createdTime: "2026-09-13T00:00:00+07:00",
        },
        {
          adId: "",
          adName: "",
          campaignId: "boost",
          campaignName: 'โพสต์: "เมนูปี 2024"',
          impressions: 0,
          reach: 0,
          clicks: 0,
          ctr: 0,
          spend: 0,
          createdTime: "2026-02-01T00:00:00+07:00",
          deliveredYears: [2026],
        },
      ],
      { includeOrganicPosts: true }
    )
    expect(filterMetaCampaignOptions(options, { year: 2026, includeOrganicPosts: true }).map((o) => o.id)).toEqual([
      "seoul",
      "boost",
    ])
    expect(filterMetaCampaignOptions(options, { year: 2024, includeOrganicPosts: true })).toEqual([])
    expect(filterMetaCampaignOptions(options, { year: 2025 }).map((o) => o.id)).toEqual(["seoul"])
  })

  it("starts on all years when the current year only has boosted posts", () => {
    const options = uniqueMetaAdsCampaigns(
      [
        {
          adId: "",
          adName: "",
          campaignId: "old",
          campaignName: "การโปรโมท [8/8/2025]",
          impressions: 0,
          reach: 0,
          clicks: 0,
          ctr: 0,
          spend: 0,
        },
        {
          adId: "",
          adName: "",
          campaignId: "post2026",
          campaignName: 'โพสต์: "lunch"',
          impressions: 0,
          reach: 0,
          clicks: 0,
          ctr: 0,
          spend: 0,
          createdTime: "2026-04-01T00:00:00+07:00",
        },
      ],
      { includeOrganicPosts: true }
    )
    expect(metaCampaignPickerInitialView(options, 2026)).toEqual({
      year: "all",
      includeOrganicPosts: false,
    })
  })

  it("keeps a named 2025 title in 2026 when it delivered this year", () => {
    const options = uniqueMetaAdsCampaigns([
      {
        adId: "1",
        adName: "A",
        campaignId: "spent",
        campaignName: "การโปรโมท Choongman Thailand ในวันที่ [8/8/2025]",
        impressions: 10,
        reach: 8,
        clicks: 1,
        ctr: 0.1,
        spend: 50,
        createdTime: "2025-08-08T00:00:00+0700",
        deliveredYears: [2026],
      },
    ])
    expect(filterMetaCampaignOptions(options, { year: 2026 }).map((o) => o.id)).toEqual(["spent"])
    expect(filterMetaCampaignOptions(options, { year: 2025 }).map((o) => o.id)).toEqual(["spent"])
  })
})

describe("kanban status map", () => {
  it("maps columns to material status", () => {
    expect(materialStatusForColumn("todo")).toBe("planning")
    expect(materialStatusForColumn("doing")).toBe("producing")
    expect(materialStatusForColumn("done")).toBe("distributed")
  })
})
