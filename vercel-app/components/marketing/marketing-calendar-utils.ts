import type {
  MarketingAd,
  MarketingCampaign,
  MarketingInfluencer,
  MarketingMaterial,
  PosPromo,
} from "@/lib/api-client"

export type CalendarLayerId = "campaign" | "promo" | "ad" | "influencer" | "material"

export type CalendarEventKind =
  | "campaign_start"
  | "campaign_end"
  | "promo_start"
  | "promo_end"
  | "ad_publish"
  | "ad_period_end"
  | "influencer_shoot"
  | "influencer_publish"
  | "material_display_start"
  | "material_display_end"

export type MarketingCalendarEvent = {
  id: string
  date: string
  label: string
  shortLabel: string
  kind: CalendarEventKind
  layer: CalendarLayerId
  campaignId: string | null
  campaignNo: string
  meta?: string
  /** 프로모션 세트 id (layer promo) */
  promoId?: string
  /** 매장 필터용: 캠페인·홍보물 지점 */
  storeKeys: string[]
}

const LAYER_BY_KIND: Record<CalendarEventKind, CalendarLayerId> = {
  campaign_start: "campaign",
  campaign_end: "campaign",
  promo_start: "promo",
  promo_end: "promo",
  ad_publish: "ad",
  ad_period_end: "ad",
  influencer_shoot: "influencer",
  influencer_publish: "influencer",
  material_display_start: "material",
  material_display_end: "material",
}

export function layerOfEvent(e: MarketingCalendarEvent): CalendarLayerId {
  return LAYER_BY_KIND[e.kind] ?? e.layer
}

function campTag(c: MarketingCampaign | undefined) {
  const no = (c?.campaignNo ?? "").trim()
  return no ? `[${no}] ` : ""
}

function shortTopic(s: string, max = 22) {
  const t = (s ?? "").trim()
  return t.length > max ? t.slice(0, max) + "…" : t
}

/** 방콕 기준 해당 월의 첫 요일(0=일)과 일수 */
export function getBangkokMonthGridMeta(monthYm: string): { startPad: number; daysInMonth: number; y: number; m: number } {
  const [y, m] = monthYm.split("-").map(Number)
  if (!y || !m) return { startPad: 0, daysInMonth: 31, y: new Date().getFullYear(), m: new Date().getMonth() + 1 }
  const firstLong = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "long" }).format(
    new Date(`${monthYm}-01T12:00:00+07:00`)
  )
  const startPad = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(firstLong)
  const daysInMonth = new Date(y, m, 0).getDate()
  return { startPad: startPad >= 0 ? startPad : 0, daysInMonth, y, m }
}

function campaignStoreKeys(c: MarketingCampaign): string[] {
  const b = c.branches
  if (!Array.isArray(b) || b.length === 0) return []
  return b.map((x) => String(x).trim()).filter(Boolean)
}

function materialStoreKeys(mat: MarketingMaterial): string[] {
  if (mat.isHqWide) return []
  const b = mat.branches
  if (!Array.isArray(b) || b.length === 0) return []
  return b.map((x) => String(x).trim()).filter(Boolean)
}

function influencerStoreKeys(i: MarketingInfluencer): string[] {
  const br = (i.branchReview ?? "").trim()
  return br ? [br] : []
}

export function buildMarketingCalendarEvents(params: {
  campaigns: MarketingCampaign[]
  ads: MarketingAd[]
  influencers: MarketingInfluencer[]
  materials: MarketingMaterial[]
  promos: PosPromo[]
}): MarketingCalendarEvent[] {
  const cmap = new Map<string, MarketingCampaign>()
  for (const c of params.campaigns) cmap.set(c.id, c)

  const list: MarketingCalendarEvent[] = []

  for (const c of params.campaigns) {
    const tag = campTag(c)
    const stores = campaignStoreKeys(c)
    if (c.startDate) {
      const d = c.startDate.slice(0, 10)
      list.push({
        id: `c-start-${c.id}`,
        date: d,
        label: `[캠페인] ${tag}${c.topic} 시작`,
        shortLabel: `${tag}${shortTopic(c.topic)} 시작`,
        kind: "campaign_start",
        layer: "campaign",
        campaignId: c.id,
        campaignNo: (c.campaignNo ?? "").trim(),
        meta: c.status ? `상태 ${c.status}` : undefined,
        storeKeys: stores,
      })
    }
    if (c.endDate && c.endDate.slice(0, 10) !== (c.startDate ?? "").slice(0, 10)) {
      const d = c.endDate.slice(0, 10)
      list.push({
        id: `c-end-${c.id}`,
        date: d,
        label: `[캠페인] ${tag}${c.topic} 종료`,
        shortLabel: `${tag}${shortTopic(c.topic)} 종료`,
        kind: "campaign_end",
        layer: "campaign",
        campaignId: c.id,
        campaignNo: (c.campaignNo ?? "").trim(),
        storeKeys: stores,
      })
    }
  }

  for (const p of params.promos) {
    const cid = p.marketingCampaignId?.trim() || null
    const camp = cid ? cmap.get(cid) : undefined
    const tag = campTag(camp)
    const stores = camp ? campaignStoreKeys(camp) : []
    const name = p.name || p.code || "프로모션"
    if (p.validFrom) {
      const d = p.validFrom.slice(0, 10)
      list.push({
        id: `p-start-${p.id}`,
        date: d,
        label: `[프로모션] ${tag}${name} (${p.code})`,
        shortLabel: `${tag}${shortTopic(name)} 시작`,
        kind: "promo_start",
        layer: "promo",
        campaignId: cid,
        campaignNo: (camp?.campaignNo ?? p.marketingCampaignNo ?? "").trim(),
        meta: p.isActive === false ? "비활성" : undefined,
        promoId: String(p.id),
        storeKeys: stores,
      })
    }
    if (p.validTo && p.validTo.slice(0, 10) !== (p.validFrom ?? "").slice(0, 10)) {
      const d = p.validTo.slice(0, 10)
      list.push({
        id: `p-end-${p.id}`,
        date: d,
        label: `[프로모션] ${tag}${name} (${p.code}) 종료`,
        shortLabel: `${tag}${shortTopic(name)} 종료`,
        kind: "promo_end",
        layer: "promo",
        campaignId: cid,
        campaignNo: (camp?.campaignNo ?? p.marketingCampaignNo ?? "").trim(),
        promoId: String(p.id),
        storeKeys: stores,
      })
    }
  }

  for (const a of params.ads) {
    const cid = a.campaignId?.trim() || null
    const camp = cid ? cmap.get(cid) : undefined
    const tag = campTag(camp)
    const stores = camp ? campaignStoreKeys(camp) : []
    const topic = (a.contentTopic || a.platform || "").trim() || "광고"
    const spend = Number(a.actualSpent) || 0
    const budget = Number(a.boostBudget) || 0
    const roasLine =
      spend > 0 ? `지출 ${spend.toLocaleString()}${budget ? ` · 예산 ${budget.toLocaleString()}` : ""}` : budget ? `예산 ${budget.toLocaleString()}` : ""

    if (a.publishDate) {
      const d = a.publishDate.slice(0, 10)
      list.push({
        id: `ad-pub-${a.id}`,
        date: d,
        label: `[광고·ROAS] ${tag}${topic}`,
        shortLabel: `${tag}${shortTopic(topic)} 게시`,
        kind: "ad_publish",
        layer: "ad",
        campaignId: cid,
        campaignNo: (a.campaignNo ?? camp?.campaignNo ?? "").trim(),
        meta: [a.platform, roasLine].filter(Boolean).join(" · "),
        storeKeys: stores,
      })
    }
    const end = (a.periodEndDate ?? "").trim()
    if (end && end.slice(0, 10) !== (a.publishDate ?? "").slice(0, 10)) {
      const d = end.slice(0, 10)
      list.push({
        id: `ad-end-${a.id}`,
        date: d,
        label: `[광고·ROAS] ${tag}${topic} 노출 종료`,
        shortLabel: `${shortTopic(topic)} 노출 종료`,
        kind: "ad_period_end",
        layer: "ad",
        campaignId: cid,
        campaignNo: (a.campaignNo ?? camp?.campaignNo ?? "").trim(),
        meta: roasLine || undefined,
        storeKeys: stores,
      })
    }
  }

  for (const i of params.influencers) {
    const cid = i.campaignId?.trim() || null
    const camp = cid ? cmap.get(cid) : undefined
    const tag = campTag(camp)
    const stores = [...(camp ? campaignStoreKeys(camp) : []), ...influencerStoreKeys(i)]
    const nm = i.name || "인플루언서"
    if (i.shootingDate) {
      const d = i.shootingDate.slice(0, 10)
      list.push({
        id: `inf-shoot-${i.id}`,
        date: d,
        label: `[인플루언서] ${tag}${nm} 촬영`,
        shortLabel: `${tag}${shortTopic(nm)} 촬영`,
        kind: "influencer_shoot",
        layer: "influencer",
        campaignId: cid,
        campaignNo: (i.campaignNo ?? camp?.campaignNo ?? "").trim(),
        meta: i.contentTopic ? shortTopic(i.contentTopic, 40) : undefined,
        storeKeys: stores.filter(Boolean),
      })
    }
    if (i.publishDate) {
      const d = i.publishDate.slice(0, 10)
      list.push({
        id: `inf-pub-${i.id}`,
        date: d,
        label: `[인플루언서] ${tag}${nm} 게시`,
        shortLabel: `${tag}${shortTopic(nm)} 게시`,
        kind: "influencer_publish",
        layer: "influencer",
        campaignId: cid,
        campaignNo: (i.campaignNo ?? camp?.campaignNo ?? "").trim(),
        meta: [i.status, i.followers ? `팔로워 ${i.followers}` : ""].filter(Boolean).join(" · ") || undefined,
        storeKeys: stores.filter(Boolean),
      })
    }
  }

  for (const mat of params.materials) {
    const cid = mat.campaignId?.trim() || null
    const camp = cid ? cmap.get(cid) : undefined
    const tag = campTag(camp)
    const stores = [...(camp ? campaignStoreKeys(camp) : []), ...materialStoreKeys(mat)]
    const nm = mat.name || "홍보물"
    if (mat.displayStartDate) {
      const d = mat.displayStartDate.slice(0, 10)
      list.push({
        id: `mat-start-${mat.id}`,
        date: d,
        label: `[홍보물] ${tag}${nm} 노출 시작`,
        shortLabel: `${tag}${shortTopic(nm)} 노출`,
        kind: "material_display_start",
        layer: "material",
        campaignId: cid,
        campaignNo: (mat.campaignNo ?? camp?.campaignNo ?? "").trim(),
        meta: mat.status ? `상태 ${mat.status}` : undefined,
        storeKeys: Array.from(new Set(stores.map((x) => x.trim()).filter(Boolean))),
      })
    }
    if (mat.displayEndDate && mat.displayEndDate.slice(0, 10) !== (mat.displayStartDate ?? "").slice(0, 10)) {
      const d = mat.displayEndDate.slice(0, 10)
      list.push({
        id: `mat-end-${mat.id}`,
        date: d,
        label: `[홍보물] ${tag}${nm} 노출 종료`,
        shortLabel: `${shortTopic(nm)} 노출 종료`,
        kind: "material_display_end",
        layer: "material",
        campaignId: cid,
        campaignNo: (mat.campaignNo ?? camp?.campaignNo ?? "").trim(),
        storeKeys: Array.from(new Set(stores.map((x) => x.trim()).filter(Boolean))),
      })
    }
  }

  return list
}

export function filterMarketingCalendarEvents(
  events: MarketingCalendarEvent[],
  opts: {
    layers: Set<CalendarLayerId>
    campaignId: string
    storeName: string
    promoId: string
  }
): MarketingCalendarEvent[] {
  return events.filter((e) => {
    if (!opts.layers.has(layerOfEvent(e))) return false
    if (opts.campaignId && e.campaignId !== opts.campaignId) return false
    if (opts.promoId && e.promoId !== opts.promoId) return false
    if (opts.storeName) {
      const keys = e.storeKeys
      if (keys.length === 0) return true
      return keys.some((k) => k === opts.storeName || k.includes(opts.storeName))
    }
    return true
  })
}

export function eventsByDateForMonth(events: MarketingCalendarEvent[], monthYm: string): Record<string, MarketingCalendarEvent[]> {
  const map: Record<string, MarketingCalendarEvent[]> = {}
  for (const e of events) {
    const d = e.date.slice(0, 10)
    if (!d.startsWith(monthYm)) continue
    if (!map[d]) map[d] = []
    map[d].push(e)
  }
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => a.label.localeCompare(b.label, "ko"))
  }
  return map
}

export const CALENDAR_LAYER_OPTIONS: { id: CalendarLayerId; label: string; description: string }[] = [
  { id: "campaign", label: "캠페인", description: "시작·종료" },
  { id: "promo", label: "프로모션 세트", description: "유효기간" },
  { id: "ad", label: "광고·ROAS", description: "게시·노출" },
  { id: "influencer", label: "인플루언서", description: "촬영·게시" },
  { id: "material", label: "홍보물", description: "매장 노출" },
]
