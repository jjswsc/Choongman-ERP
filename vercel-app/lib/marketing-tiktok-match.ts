import type { TikTokAdInsightRow } from "@/lib/tiktok-ads"
import {
  normalizeMetaName,
  parseMetaCampaignLinks,
  serializeMetaCampaignLinks,
  type MetaCampaignLink,
} from "@/lib/marketing-meta-match"

export type TikTokCampaignLink = MetaCampaignLink

export const parseTikTokCampaignLinks = parseMetaCampaignLinks
export const serializeTikTokCampaignLinks = serializeMetaCampaignLinks

function yearFromTikTokTimestamp(raw: string | number | undefined | null): number | null {
  if (raw == null || raw === "") return null
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000
    const y = new Date(ms).getUTCFullYear()
    return y >= 2000 && y <= 2100 ? y : null
  }
  const s = String(raw).trim()
  if (!s) return null
  if (/^\d{9,13}$/.test(s)) {
    const n = Number(s)
    const ms = n > 1e12 ? n : n * 1000
    const y = new Date(ms).getUTCFullYear()
    return y >= 2000 && y <= 2100 ? y : null
  }
  const iso = s.match(/^(20\d{2})(?:[-T\s]|$)/)
  if (iso) return Number(iso[1])
  const t = Date.parse(s)
  if (Number.isFinite(t)) {
    const y = new Date(t).getUTCFullYear()
    return y >= 2000 && y <= 2100 ? y : null
  }
  return null
}

function yearsForTikTokCampaign(name: string, createdTime?: string): number[] {
  const years = new Set<number>()
  const createdY = yearFromTikTokTimestamp(createdTime)
  if (createdY != null) years.add(createdY)
  const inName = String(name || "").match(/(?:^|[^\d])(20\d{2})(?:[^\d]|$)/)
  if (inName) years.add(Number(inName[1]))
  return [...years].sort((a, b) => b - a)
}

function adMatchesTikTokLink(a: TikTokAdInsightRow, link: TikTokCampaignLink): boolean {
  const id = String(link.id || "").trim().toLowerCase()
  const mappedName = normalizeMetaName(link.name || "")
  if (id) {
    if (
      String(a.campaignId || "").toLowerCase() === id ||
      String(a.adId || "").toLowerCase() === id ||
      normalizeMetaName(a.campaignName) === id
    ) {
      return true
    }
  }
  const n = normalizeMetaName(a.campaignName)
  if (mappedName) {
    if (n === mappedName || n.includes(mappedName) || mappedName.includes(n)) return true
  }
  return false
}

/** ERP 캠페인과 TikTok Ads campaign_name / id 매칭. 다중 링크는 OR. */
export function filterTikTokAdsForCampaign(
  ads: TikTokAdInsightRow[],
  campaign: { topic?: string; tiktokCampaignId?: string; tiktokCampaignName?: string }
): TikTokAdInsightRow[] {
  const links = parseTikTokCampaignLinks(campaign.tiktokCampaignId, campaign.tiktokCampaignName)
  if (links.length) {
    const out: TikTokAdInsightRow[] = []
    const seen = new Set<string>()
    for (const a of ads) {
      const key = `${a.campaignId || ""}|${a.adId || ""}|${a.campaignName || ""}`
      if (seen.has(key)) continue
      if (!links.some((link) => adMatchesTikTokLink(a, link))) continue
      seen.add(key)
      out.push(a)
    }
    return out
  }
  const topic = normalizeMetaName(campaign.topic || "")
  if (!topic) return []
  return ads.filter((a) => {
    const n = normalizeMetaName(a.campaignName)
    if (!n) return false
    return n.includes(topic) || topic.includes(n)
  })
}

export type TikTokAdsCampaignOption = {
  id: string
  name: string
  year: number | null
  years: number[]
}

/** 매핑용 TikTok 캠페인 목록 (실적 행 + 카탈로그 행). */
export function uniqueTikTokAdsCampaigns(ads: TikTokAdInsightRow[]): TikTokAdsCampaignOption[] {
  const map = new Map<string, { name: string; spend: number; createdTime?: string }>()
  for (const a of ads || []) {
    const id = String(a.campaignId || "").trim()
    const name = String(a.campaignName || "").trim()
    const key = id || name
    if (!key) continue
    const spend = Number(a.spend) || 0
    const createdTime = String(a.createdTime || "").trim()
    const prev = map.get(key)
    if (!prev || spend > prev.spend || (!prev.name && name)) {
      map.set(key, {
        name: name || id,
        spend: Math.max(prev?.spend || 0, spend),
        createdTime: createdTime || prev?.createdTime,
      })
    } else if (createdTime && !prev.createdTime) {
      prev.createdTime = createdTime
    }
  }
  return [...map.entries()]
    .map(([id, v]) => {
      const years = yearsForTikTokCampaign(v.name, v.createdTime)
      return { id, name: v.name, year: years[0] ?? null, years }
    })
    .sort((a, b) => {
      const na = Number(String(a.id || "").replace(/\D/g, "").slice(0, 15))
      const nb = Number(String(b.id || "").replace(/\D/g, "").slice(0, 15))
      return (Number.isFinite(nb) ? nb : 0) - (Number.isFinite(na) ? na : 0)
    })
}

export function countTikTokCampaignsByYear(
  options: TikTokAdsCampaignOption[]
): Map<number | "none", number> {
  const map = new Map<number | "none", number>()
  for (const o of options || []) {
    const years = o.years?.length ? o.years : o.year != null ? [o.year] : []
    if (!years.length) {
      map.set("none", (map.get("none") || 0) + 1)
      continue
    }
    for (const y of years) map.set(y, (map.get(y) || 0) + 1)
  }
  return map
}

export function filterTikTokCampaignOptions(
  options: TikTokAdsCampaignOption[],
  opts?: { query?: string; year?: number | "all" | "none" }
): TikTokAdsCampaignOption[] {
  const qRaw = String(opts?.query || "").trim().toLowerCase()
  const q = normalizeMetaName(opts?.query || "")
  const year = opts?.year ?? "all"
  return (options || []).filter((o) => {
    const years = o.years?.length ? o.years : o.year != null ? [o.year] : []
    if (year === "none" && years.length) return false
    if (typeof year === "number" && !years.includes(year)) return false
    if (!qRaw) return true
    if (q && normalizeMetaName(o.name).includes(q)) return true
    if (o.id.toLowerCase().includes(qRaw)) return true
    if (years.some((y) => String(y) === qRaw)) return true
    return false
  })
}

/** 카탈로그 행을 ads에 합친다. 이미 있는 campaignId는 이름·생성시각만 보강. */
export function appendTikTokCampaignCatalog(
  ads: TikTokAdInsightRow[],
  rows: { campaignId: string; campaignName: string; createdTime?: string }[]
): number {
  const byId = new Map(ads.map((a) => [String(a.campaignId || "").trim(), a] as const))
  let added = 0
  for (const c of rows || []) {
    const id = String(c.campaignId || "").trim()
    if (!id) continue
    const name = String(c.campaignName || "").trim() || id
    const createdTime = String(c.createdTime || "").trim()
    const existing = byId.get(id)
    if (existing) {
      if (!existing.campaignName && name) existing.campaignName = name
      if (!existing.createdTime && createdTime) existing.createdTime = createdTime
      continue
    }
    const row: TikTokAdInsightRow = {
      adId: "",
      adName: "",
      campaignId: id,
      campaignName: name,
      impressions: 0,
      reach: 0,
      clicks: 0,
      ctr: 0,
      spend: 0,
      createdTime: createdTime || undefined,
    }
    ads.push(row)
    byId.set(id, row)
    added += 1
  }
  return added
}
