import { normalizeMetaName, uniqueMetaAdsCampaigns } from "@/lib/marketing-meta-match"
import type { MetaAdInsightRow } from "@/lib/meta-graph"

export type MetaMapSuggestion = {
  campaignId: number
  topic: string
  metaCampaignId: string
  metaCampaignName: string
  score: number
  reason: "exact" | "contains" | "token"
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter((t) => t.length >= 2))
  const tb = new Set(b.split(" ").filter((t) => t.length >= 2))
  if (!ta.size || !tb.size) return 0
  let hit = 0
  for (const t of ta) if (tb.has(t)) hit += 1
  return hit / Math.max(ta.size, tb.size)
}

/** ERP topic ↔ Meta Ads 캠페인 자동 매칭 제안 (미매핑만). */
export function suggestMetaCampaignMappings(params: {
  campaigns: { id: number; topic: string; metaCampaignId?: string; metaCampaignName?: string; status?: string }[]
  ads: MetaAdInsightRow[]
  onlyUnmapped?: boolean
  minScore?: number
}): MetaMapSuggestion[] {
  const minScore = params.minScore ?? 0.45
  const onlyUnmapped = params.onlyUnmapped !== false
  const metaList = uniqueMetaAdsCampaigns(params.ads)
  const suggestions: MetaMapSuggestion[] = []
  const usedMeta = new Set<string>()

  for (const c of params.campaigns) {
    const already =
      String(c.metaCampaignId || "").trim() || String(c.metaCampaignName || "").trim()
    if (onlyUnmapped && already) continue
    const topic = normalizeMetaName(c.topic || "")
    if (!topic) continue

    let best: MetaMapSuggestion | null = null
    for (const m of metaList) {
      const key = m.id || m.name
      if (usedMeta.has(key)) continue
      const name = normalizeMetaName(m.name || m.id)
      if (!name) continue
      let score = 0
      let reason: MetaMapSuggestion["reason"] = "token"
      if (name === topic) {
        score = 1
        reason = "exact"
      } else if (name.includes(topic) || topic.includes(name)) {
        score = 0.85
        reason = "contains"
      } else {
        score = tokenOverlap(topic, name)
        reason = "token"
      }
      if (score < minScore) continue
      if (!best || score > best.score) {
        best = {
          campaignId: c.id,
          topic: c.topic,
          metaCampaignId: m.id || "",
          metaCampaignName: m.name || m.id,
          score,
          reason,
        }
      }
    }
    if (best) {
      usedMeta.add(best.metaCampaignId || best.metaCampaignName)
      suggestions.push(best)
    }
  }
  return suggestions.sort((a, b) => b.score - a.score)
}
