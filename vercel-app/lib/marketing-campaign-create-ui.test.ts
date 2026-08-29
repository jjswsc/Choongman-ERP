import { describe, expect, it } from "vitest"
import {
  MARKETING_CAMPAIGN_CREATE_UI,
  marketingCampaignWorkspaceHref,
  parseMarketingCampaignWorkspaceTab,
} from "./marketing-campaign-create-ui"

describe("marketing campaign workspace routing", () => {
  it("keeps create UI off by default", () => {
    expect(MARKETING_CAMPAIGN_CREATE_UI).toBe(false)
  })

  it("maps legacy material/influencer tabs to tasks", () => {
    expect(parseMarketingCampaignWorkspaceTab("materials")).toBe("tasks")
    expect(parseMarketingCampaignWorkspaceTab("influencers")).toBe("tasks")
    expect(parseMarketingCampaignWorkspaceTab("form")).toBe("overview")
    expect(parseMarketingCampaignWorkspaceTab("promos")).toBe("promos")
  })

  it("builds workspace hrefs", () => {
    expect(marketingCampaignWorkspaceHref("abc")).toBe("/admin/marketing/campaigns/abc")
    expect(marketingCampaignWorkspaceHref("abc", "collab")).toBe(
      "/admin/marketing/campaigns/abc?tab=collab"
    )
  })
})
