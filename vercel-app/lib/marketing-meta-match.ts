import type { MetaAdInsightRow } from "./meta-graph"

export function normalizeMetaName(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ก-๙]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** ERP 캠페인과 Meta Ads campaign_name / id 매칭. 매핑·이름 겹침이 없으면 빈 배열. */
export function filterAdsForCampaign(
  ads: MetaAdInsightRow[],
  campaign: { topic?: string; metaCampaignId?: string; metaCampaignName?: string }
): MetaAdInsightRow[] {
  const id = String(campaign.metaCampaignId || "").trim().toLowerCase()
  const mappedName = normalizeMetaName(campaign.metaCampaignName || "")
  const topic = normalizeMetaName(campaign.topic || "")
  if (id) {
    const byId = ads.filter(
      (a) =>
        String(a.campaignId || "").toLowerCase() === id ||
        String(a.adId || "").toLowerCase() === id ||
        normalizeMetaName(a.campaignName) === id
    )
    if (byId.length) return byId
  }
  if (mappedName) {
    const byMap = ads.filter((a) => {
      const n = normalizeMetaName(a.campaignName)
      return n === mappedName || n.includes(mappedName) || mappedName.includes(n)
    })
    if (byMap.length) return byMap
  }
  if (!topic) return []
  return ads.filter((a) => {
    const n = normalizeMetaName(a.campaignName)
    if (!n) return false
    return n.includes(topic) || topic.includes(n)
  })
}

export function materialStatusForColumn(col: "todo" | "doing" | "done"): string {
  if (col === "done") return "distributed"
  if (col === "doing") return "producing"
  return "planning"
}

export function influencerStatusForColumn(col: "todo" | "doing" | "done"): string {
  if (col === "done") return "finish"
  if (col === "doing") return "ongoing"
  return "draft"
}

export function uniqueMetaAdsCampaigns(
  ads: MetaAdInsightRow[]
): { id: string; name: string }[] {
  const map = new Map<string, string>()
  for (const a of ads || []) {
    const id = String(a.campaignId || "").trim()
    const name = String(a.campaignName || "").trim()
    const key = id || name
    if (!key) continue
    if (!map.has(key)) map.set(key, name || id)
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }))
}
