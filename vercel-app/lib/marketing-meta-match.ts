import type { MetaAdInsightRow } from "./meta-graph"

export function normalizeMetaName(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ก-๙]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Meta Boost/유기 포스트 캠페인명 (โพสต์: / Post:) — 드롭다운에서 제외 */
export function isMetaOrganicPostCampaignName(name: string): boolean {
  return /^(โพสต์|post)\s*:/i.test(String(name || "").trim())
}

/** 「การโปรโมท … ในวันที่ [D/M/YYYY]」 등에서 날짜 추출 (최신순 정렬용) */
export function parseMetaPromoDateMs(name: string): number | null {
  const m = String(name || "").match(/\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  const t = Date.UTC(year, month - 1, day)
  return Number.isFinite(t) ? t : null
}

function metaCampaignSortKey(id: string, name: string): number {
  const fromDate = parseMetaPromoDateMs(name)
  if (fromDate != null) return fromDate
  // Meta 객체 ID는 대체로 증가 → 숫자로 비교
  const n = Number(String(id || "").replace(/\D/g, "").slice(0, 15))
  return Number.isFinite(n) ? n : 0
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

/**
 * Ads Manager 캠페인 목록 (매핑 드롭다운용).
 * 기본: โพสต์/Post 유기형 이름 제외, 날짜·ID 기준 최신순.
 */
export function uniqueMetaAdsCampaigns(
  ads: MetaAdInsightRow[],
  opts?: { includeOrganicPosts?: boolean }
): { id: string; name: string }[] {
  const includePosts = opts?.includeOrganicPosts === true
  const map = new Map<string, { name: string; spend: number }>()
  for (const a of ads || []) {
    const id = String(a.campaignId || "").trim()
    const name = String(a.campaignName || "").trim()
    const key = id || name
    if (!key) continue
    if (!includePosts && isMetaOrganicPostCampaignName(name)) continue
    const spend = Number(a.spend) || 0
    const prev = map.get(key)
    if (!prev || spend > prev.spend || (!prev.name && name)) {
      map.set(key, { name: name || id, spend: Math.max(prev?.spend || 0, spend) })
    }
  }
  return [...map.entries()]
    .map(([id, v]) => ({ id, name: v.name }))
    .sort((a, b) => metaCampaignSortKey(b.id, b.name) - metaCampaignSortKey(a.id, a.name))
}
