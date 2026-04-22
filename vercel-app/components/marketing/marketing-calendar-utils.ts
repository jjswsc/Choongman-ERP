import type {
  MarketingAd,
  MarketingCampaign,
  MarketingInfluencer,
  MarketingMaterial,
  PosPromo,
} from "@/lib/api-client"

export type CalendarLayerId = "campaign" | "promo" | "ad" | "influencer" | "material" | "collab"

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
  | "collab_design_start"
  | "collab_design_end"

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
  collab_design_start: "collab",
  collab_design_end: "collab",
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

function calTpl(template: string, vars: Record<string, string>) {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v)
  }
  return out
}

/** 캘린더 이벤트 문구(레이어 칩·툴팁용). `useT`로 채워 전달합니다. */
export type MarketingCalendarEventLocale = {
  bracketCampaign: string
  bracketPromo: string
  bracketAdRoas: string
  bracketInfluencer: string
  bracketMaterial: string
  bracketCollab: string
  verbStart: string
  verbEnd: string
  verbPublish: string
  verbShoot: string
  verbDisplayStart: string
  verbDisplayShort: string
  verbExposureEnd: string
  verbDesignStart: string
  verbDesignEnd: string
  defaultPromo: string
  defaultAd: string
  defaultInfluencer: string
  defaultMaterial: string
  inactive: string
  metaStatusTpl: string
  metaFollowersTpl: string
  spend: string
  budget: string
  sepMid: string
}

export function buildMarketingCalendarEvents(params: {
  campaigns: MarketingCampaign[]
  ads: MarketingAd[]
  influencers: MarketingInfluencer[]
  materials: MarketingMaterial[]
  promos: PosPromo[]
  locale: MarketingCalendarEventLocale
}): MarketingCalendarEvent[] {
  const L = params.locale
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
        label: `${L.bracketCampaign} ${tag}${c.topic} ${L.verbStart}`,
        shortLabel: `${tag}${shortTopic(c.topic)} ${L.verbStart}`,
        kind: "campaign_start",
        layer: "campaign",
        campaignId: c.id,
        campaignNo: (c.campaignNo ?? "").trim(),
        meta: c.status ? calTpl(L.metaStatusTpl, { status: c.status }) : undefined,
        storeKeys: stores,
      })
    }
    if (c.endDate && c.endDate.slice(0, 10) !== (c.startDate ?? "").slice(0, 10)) {
      const d = c.endDate.slice(0, 10)
      list.push({
        id: `c-end-${c.id}`,
        date: d,
        label: `${L.bracketCampaign} ${tag}${c.topic} ${L.verbEnd}`,
        shortLabel: `${tag}${shortTopic(c.topic)} ${L.verbEnd}`,
        kind: "campaign_end",
        layer: "campaign",
        campaignId: c.id,
        campaignNo: (c.campaignNo ?? "").trim(),
        storeKeys: stores,
      })
    }

    const phases = c.phasePeriods ?? []
    phases.forEach((p, idx) => {
      const pl = (p.label ?? "").trim() || `#${idx + 1}`
      if (p.startDate) {
        const d = p.startDate.slice(0, 10)
        list.push({
          id: `c-phase-${c.id}-s-${idx}`,
          date: d,
          label: `${L.bracketCampaign} ${tag}${c.topic}${L.sepMid}${pl} ${L.verbStart}`,
          shortLabel: `${tag}${shortTopic(c.topic)} ${pl} ${L.verbStart}`,
          kind: "campaign_start",
          layer: "campaign",
          campaignId: c.id,
          campaignNo: (c.campaignNo ?? "").trim(),
          meta: pl,
          storeKeys: stores,
        })
      }
      if (p.endDate && p.endDate.slice(0, 10) !== (p.startDate ?? "").slice(0, 10)) {
        const d = p.endDate.slice(0, 10)
        list.push({
          id: `c-phase-${c.id}-e-${idx}`,
          date: d,
          label: `${L.bracketCampaign} ${tag}${c.topic}${L.sepMid}${pl} ${L.verbEnd}`,
          shortLabel: `${tag}${shortTopic(c.topic)} ${pl} ${L.verbEnd}`,
          kind: "campaign_end",
          layer: "campaign",
          campaignId: c.id,
          campaignNo: (c.campaignNo ?? "").trim(),
          meta: pl,
          storeKeys: stores,
        })
      }
    })
  }

  /** 협업 관리 대상 캠페인 — 디자인 기간만 별도 레이어로 표시 */
  for (const c of params.campaigns) {
    if (!c.collabManagement) continue
    const tag = campTag(c)
    const stores = campaignStoreKeys(c)
    const ds = (c.designStartDate ?? "").trim().slice(0, 10)
    const de = (c.designEndDate ?? "").trim().slice(0, 10)
    if (ds) {
      list.push({
        id: `collab-ds-${c.id}`,
        date: ds,
        label: `${L.bracketCollab} ${tag}${c.topic} ${L.verbDesignStart}`,
        shortLabel: `${tag}${shortTopic(c.topic)} ${L.verbDesignStart}`,
        kind: "collab_design_start",
        layer: "collab",
        campaignId: c.id,
        campaignNo: (c.campaignNo ?? "").trim(),
        meta: c.status ? calTpl(L.metaStatusTpl, { status: c.status }) : undefined,
        storeKeys: stores,
      })
    }
    if (de && de !== ds) {
      list.push({
        id: `collab-de-${c.id}`,
        date: de,
        label: `${L.bracketCollab} ${tag}${c.topic} ${L.verbDesignEnd}`,
        shortLabel: `${tag}${shortTopic(c.topic)} ${L.verbDesignEnd}`,
        kind: "collab_design_end",
        layer: "collab",
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
    const name = p.name || p.code || L.defaultPromo
    if (p.validFrom) {
      const d = p.validFrom.slice(0, 10)
      list.push({
        id: `p-start-${p.id}`,
        date: d,
        label: `${L.bracketPromo} ${tag}${name} (${p.code})`,
        shortLabel: `${tag}${shortTopic(name)} ${L.verbStart}`,
        kind: "promo_start",
        layer: "promo",
        campaignId: cid,
        campaignNo: (camp?.campaignNo ?? p.marketingCampaignNo ?? "").trim(),
        meta: p.isActive === false ? L.inactive : undefined,
        promoId: String(p.id),
        storeKeys: stores,
      })
    }
    if (p.validTo && p.validTo.slice(0, 10) !== (p.validFrom ?? "").slice(0, 10)) {
      const d = p.validTo.slice(0, 10)
      list.push({
        id: `p-end-${p.id}`,
        date: d,
        label: `${L.bracketPromo} ${tag}${name} (${p.code}) ${L.verbEnd}`,
        shortLabel: `${tag}${shortTopic(name)} ${L.verbEnd}`,
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
    const topic = (a.contentTopic || a.platform || "").trim() || L.defaultAd
    const spend = Number(a.actualSpent) || 0
    const budget = Number(a.boostBudget) || 0
    const spendPart = spend > 0 ? `${L.spend} ${spend.toLocaleString()}` : ""
    const budgetPart = budget > 0 ? `${L.budget} ${budget.toLocaleString()}` : ""
    let roasLine = ""
    if (spendPart && budgetPart) roasLine = `${spendPart}${L.sepMid}${budgetPart}`
    else roasLine = spendPart || budgetPart

    if (a.publishDate) {
      const d = a.publishDate.slice(0, 10)
      list.push({
        id: `ad-pub-${a.id}`,
        date: d,
        label: `${L.bracketAdRoas} ${tag}${topic}`,
        shortLabel: `${tag}${shortTopic(topic)} ${L.verbPublish}`,
        kind: "ad_publish",
        layer: "ad",
        campaignId: cid,
        campaignNo: (a.campaignNo ?? camp?.campaignNo ?? "").trim(),
        meta: [a.platform, roasLine].filter(Boolean).join(L.sepMid),
        storeKeys: stores,
      })
    }
    const end = (a.periodEndDate ?? "").trim()
    if (end && end.slice(0, 10) !== (a.publishDate ?? "").slice(0, 10)) {
      const d = end.slice(0, 10)
      list.push({
        id: `ad-end-${a.id}`,
        date: d,
        label: `${L.bracketAdRoas} ${tag}${topic} ${L.verbExposureEnd}`,
        shortLabel: `${shortTopic(topic)} ${L.verbExposureEnd}`,
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
    const nm = i.name || L.defaultInfluencer
    if (i.shootingDate) {
      const d = i.shootingDate.slice(0, 10)
      list.push({
        id: `inf-shoot-${i.id}`,
        date: d,
        label: `${L.bracketInfluencer} ${tag}${nm} ${L.verbShoot}`,
        shortLabel: `${tag}${shortTopic(nm)} ${L.verbShoot}`,
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
        label: `${L.bracketInfluencer} ${tag}${nm} ${L.verbPublish}`,
        shortLabel: `${tag}${shortTopic(nm)} ${L.verbPublish}`,
        kind: "influencer_publish",
        layer: "influencer",
        campaignId: cid,
        campaignNo: (i.campaignNo ?? camp?.campaignNo ?? "").trim(),
        meta:
          [i.status, i.followers ? calTpl(L.metaFollowersTpl, { n: String(i.followers) }) : ""].filter(Boolean).join(L.sepMid) ||
          undefined,
        storeKeys: stores.filter(Boolean),
      })
    }
  }

  for (const mat of params.materials) {
    const cid = mat.campaignId?.trim() || null
    const camp = cid ? cmap.get(cid) : undefined
    const tag = campTag(camp)
    const stores = [...(camp ? campaignStoreKeys(camp) : []), ...materialStoreKeys(mat)]
    const nm = mat.name || L.defaultMaterial
    if (mat.displayStartDate) {
      const d = mat.displayStartDate.slice(0, 10)
      list.push({
        id: `mat-start-${mat.id}`,
        date: d,
        label: `${L.bracketMaterial} ${tag}${nm} ${L.verbDisplayStart}`,
        shortLabel: `${tag}${shortTopic(nm)} ${L.verbDisplayShort}`,
        kind: "material_display_start",
        layer: "material",
        campaignId: cid,
        campaignNo: (mat.campaignNo ?? camp?.campaignNo ?? "").trim(),
        meta: mat.status ? calTpl(L.metaStatusTpl, { status: mat.status }) : undefined,
        storeKeys: Array.from(new Set(stores.map((x) => x.trim()).filter(Boolean))),
      })
    }
    if (mat.displayEndDate && mat.displayEndDate.slice(0, 10) !== (mat.displayStartDate ?? "").slice(0, 10)) {
      const d = mat.displayEndDate.slice(0, 10)
      list.push({
        id: `mat-end-${mat.id}`,
        date: d,
        label: `${L.bracketMaterial} ${tag}${nm} ${L.verbExposureEnd}`,
        shortLabel: `${shortTopic(nm)} ${L.verbExposureEnd}`,
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

export function eventsByDateForMonth(
  events: MarketingCalendarEvent[],
  monthYm: string,
  sortLocale = "en"
): Record<string, MarketingCalendarEvent[]> {
  const map: Record<string, MarketingCalendarEvent[]> = {}
  for (const e of events) {
    const d = e.date.slice(0, 10)
    if (!d.startsWith(monthYm)) continue
    if (!map[d]) map[d] = []
    map[d].push(e)
  }
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => a.label.localeCompare(b.label, sortLocale))
  }
  return map
}

export const CALENDAR_LAYER_IDS: CalendarLayerId[] = ["campaign", "promo", "ad", "influencer", "material", "collab"]

/** 달력 셀·표시 유형 토글·범례에서 동일하게 사용 */
export const CALENDAR_LAYER_CHIP_CLASS: Record<CalendarLayerId, string> = {
  campaign: "bg-violet-500/15 text-violet-800 border-violet-200 dark:text-violet-200 dark:border-violet-800",
  promo: "bg-indigo-500/15 text-indigo-800 border-indigo-200 dark:text-indigo-200 dark:border-indigo-800",
  ad: "bg-emerald-500/15 text-emerald-800 border-emerald-200 dark:text-emerald-200 dark:border-emerald-800",
  influencer: "bg-amber-500/15 text-amber-900 border-amber-200 dark:text-amber-200 dark:border-amber-800",
  material: "bg-rose-500/15 text-rose-800 border-rose-200 dark:text-rose-200 dark:border-rose-800",
  collab: "bg-sky-500/15 text-sky-900 border-sky-200 dark:text-sky-200 dark:border-sky-800",
}
