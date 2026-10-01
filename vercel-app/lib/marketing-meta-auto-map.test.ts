import { describe, expect, it } from "vitest"
import { suggestMetaCampaignMappings } from "./marketing-meta-auto-map"
import type { MetaAdInsightRow } from "./meta-graph"

const ads: MetaAdInsightRow[] = [
  {
    adId: "1",
    adName: "a",
    campaignId: "c1",
    campaignName: "Party Set Boost",
    impressions: 1,
    reach: 1,
    clicks: 1,
    ctr: 1,
    spend: 10,
  },
  {
    adId: "2",
    adName: "b",
    campaignId: "c2",
    campaignName: "Soju 1 Free 1 Jul",
    impressions: 1,
    reach: 1,
    clicks: 1,
    ctr: 1,
    spend: 20,
  },
]

describe("suggestMetaCampaignMappings", () => {
  it("maps by contains and skips already mapped", () => {
    const s = suggestMetaCampaignMappings({
      campaigns: [
        { id: 1, topic: "Party Set", status: "ongoing" },
        { id: 2, topic: "Soju 1 Free 1", metaCampaignId: "c2", metaCampaignName: "Soju 1 Free 1 BG" },
        { id: 3, topic: "Unrelated XYZ", status: "ongoing" },
      ],
      ads,
    })
    expect(s).toHaveLength(1)
    expect(s[0].campaignId).toBe(1)
    expect(s[0].metaCampaignId).toBe("c1")
    expect(s[0].reason).toBe("contains")
  })
})
