import { describe, expect, it } from "vitest"
import { resolveInitialMarketingCampaignId } from "./marketing-selected-campaign"

describe("resolveInitialMarketingCampaignId", () => {
  it("prefers the campaign in the URL", () => {
    expect(resolveInitialMarketingCampaignId({ fromQuery: "12", remembered: "7" })).toBe("12")
  })

  it("falls back to the remembered campaign", () => {
    expect(resolveInitialMarketingCampaignId({ fromQuery: "", remembered: "7" })).toBe("7")
    expect(resolveInitialMarketingCampaignId({ fromQuery: null, remembered: "7" })).toBe("7")
  })

  it("returns empty when nothing is known", () => {
    expect(resolveInitialMarketingCampaignId({})).toBe("")
    expect(resolveInitialMarketingCampaignId({ fromQuery: "  ", remembered: "  " })).toBe("")
  })
})
