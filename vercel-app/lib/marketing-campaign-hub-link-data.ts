import type {
  MarketingAd,
  MarketingInfluencer,
  MarketingMaterial,
  PosPromo,
} from "@/lib/api-client"
import {
  getMarketingAds,
  getMarketingInfluencers,
  getMarketingMaterials,
  getPosPromos,
} from "@/lib/api-client"
import {
  emptyMarketingCampaignHubLinkSets,
  type MarketingCampaignHubLinkSets,
} from "@/lib/marketing-campaign-list-query"

export function buildMarketingCampaignHubLinkSetsFromRows(
  promos: Pick<PosPromo, "marketingCampaignId">[],
  ads: Pick<MarketingAd, "campaignId">[],
  influencers: Pick<MarketingInfluencer, "campaignId">[],
  materials: Pick<MarketingMaterial, "campaignId">[]
): MarketingCampaignHubLinkSets {
  const promoIds = new Set<string>()
  for (const p of promos || []) {
    const id = String(p.marketingCampaignId ?? "").trim()
    if (id) promoIds.add(id)
  }
  const adIds = new Set<string>()
  for (const a of ads || []) {
    const id = String(a.campaignId ?? "").trim()
    if (id) adIds.add(id)
  }
  const infIds = new Set<string>()
  for (const x of influencers || []) {
    const id = String(x.campaignId ?? "").trim()
    if (id) infIds.add(id)
  }
  const matIds = new Set<string>()
  for (const m of materials || []) {
    const id = String(m.campaignId ?? "").trim()
    if (id) matIds.add(id)
  }
  return { promo: promoIds, ads: adIds, influencer: infIds, materials: matIds }
}

export async function fetchMarketingCampaignHubLinkSets(): Promise<MarketingCampaignHubLinkSets> {
  try {
    const [promos, ads, influencers, materials] = await Promise.all([
      getPosPromos(),
      getMarketingAds(),
      getMarketingInfluencers(),
      getMarketingMaterials(),
    ])
    return buildMarketingCampaignHubLinkSetsFromRows(
      Array.isArray(promos) ? promos : [],
      Array.isArray(ads) ? ads : [],
      Array.isArray(influencers) ? influencers : [],
      Array.isArray(materials) ? materials : []
    )
  } catch {
    return emptyMarketingCampaignHubLinkSets()
  }
}
