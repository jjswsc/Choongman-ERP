import { bangkokTodayYmd } from "@/lib/bangkok-date"
import { addBangkokCalendarDays } from "@/lib/bangkok-time"

export const META_GRAPH_VERSION = "v21.0"
export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "read_insights",
  "ads_read",
  "instagram_basic",
  "instagram_manage_insights",
].join(",")

export type MetaGraphError = { message: string; type?: string; code?: number }

export async function metaGraphGet<T = unknown>(
  path: string,
  accessToken: string,
  query?: Record<string, string | undefined>
): Promise<{ ok: boolean; json: T | null; error: MetaGraphError | null; status: number }> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, "")}`)
  url.searchParams.set("access_token", accessToken)
  for (const [k, v] of Object.entries(query || {})) {
    if (v != null && v !== "") url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), { cache: "no-store" })
  const json = (await res.json().catch(() => null)) as { error?: MetaGraphError } & T
  if (!res.ok || json?.error) {
    return {
      ok: false,
      json: null,
      error: json?.error || { message: `HTTP ${res.status}` },
      status: res.status,
    }
  }
  return { ok: true, json, error: null, status: res.status }
}

export function normalizeAdAccountId(raw: string): string {
  const s = String(raw || "").trim()
  if (!s) return ""
  return s.startsWith("act_") ? s : `act_${s.replace(/^act_/i, "")}`
}

export function metaAppCredentials(): { appId: string; appSecret: string } {
  return {
    appId: String(process.env.META_APP_ID || "").trim(),
    appSecret: String(process.env.META_APP_SECRET || "").trim(),
  }
}

export function metaEnvFallback(): {
  accessToken: string
  adAccountId: string
  pageId: string
} {
  return {
    accessToken: String(process.env.META_ACCESS_TOKEN || "").trim(),
    adAccountId: String(process.env.META_AD_ACCOUNT_ID || "").trim(),
    pageId: String(process.env.META_PAGE_ID || "").trim(),
  }
}

export type MetaAdInsightRow = {
  adId: string
  adName: string
  campaignId?: string
  campaignName: string
  impressions: number
  reach: number
  clicks: number
  ctr: number
  spend: number
  /** 캠페인 생성 시각 (Ads Manager). 이름에 연도가 없어도 연도 필터에 쓴다. */
  createdTime?: string
  /** 이 해에 실제로 집행된 캠페인. 생성 연도와 달라도 그 해 목록에 넣는다. */
  deliveredYears?: number[]
}

/** 캠페인·인사이트 한 페이지. Meta는 limit 상한이 100인 경우가 많다. */
export const META_GRAPH_PAGE_LIMIT = "100"
/** 한 동기화에서 따라갈 최대 페이지. 20 × 100 = 2,000건. */
export const META_GRAPH_MAX_PAGES = 20

type MetaGraphPage<T> = { data?: T[]; paging?: { next?: string } }

export async function metaGraphGetAllPages<T>(
  path: string,
  accessToken: string,
  query?: Record<string, string | undefined>,
  opts?: { maxPages?: number }
): Promise<{
  ok: boolean
  data: T[]
  error: MetaGraphError | null
  pages: number
  truncated: boolean
}> {
  const maxPages = opts?.maxPages ?? META_GRAPH_MAX_PAGES
  const first = await metaGraphGet<MetaGraphPage<T>>(path, accessToken, query)
  if (!first.ok || !first.json) {
    return { ok: false, data: [], error: first.error, pages: 0, truncated: false }
  }
  const data: T[] = [...(first.json.data || [])]
  let next = String(first.json.paging?.next || "").trim()
  let pages = 1
  const seenNext = new Set<string>()
  while (next && pages < maxPages) {
    if (seenNext.has(next)) break
    seenNext.add(next)
    const res = await fetch(next, { cache: "no-store" })
    const json = (await res.json().catch(() => null)) as { error?: MetaGraphError } & MetaGraphPage<T>
    if (!res.ok || json?.error) {
      return {
        ok: true,
        data,
        error: json?.error || { message: `HTTP ${res.status}` },
        pages,
        truncated: true,
      }
    }
    data.push(...(json.data || []))
    next = String(json.paging?.next || "").trim()
    pages += 1
  }
  return { ok: true, data, error: null, pages, truncated: Boolean(next) }
}

/** 실적 조회 구간이 걸친 연도. last_28d / last_90d 는 방콕 오늘 기준. */
export function yearsCoveredByMetaRange(params: {
  since?: string
  until?: string
  preset?: string
  todayYmd?: string
}): number[] {
  const today = String(params.todayYmd || bangkokTodayYmd()).trim()
  const until = String(params.until || "").trim() || today
  let since = String(params.since || "").trim()
  const preset = String(params.preset || "").trim()
  if (!since) {
    if (preset === "last_90d") since = addBangkokCalendarDays(until, -89)
    else if (preset === "last_28d" || !preset) since = addBangkokCalendarDays(until, -27)
    else since = until
  }
  const y0 = Number(since.slice(0, 4))
  const y1 = Number(until.slice(0, 4))
  if (!Number.isFinite(y0) || !Number.isFinite(y1)) return []
  const lo = Math.min(y0, y1)
  const hi = Math.max(y0, y1)
  const out: number[] = []
  for (let y = lo; y <= hi; y += 1) {
    if (y >= 2000 && y <= 2100) out.push(y)
  }
  return out
}

function markDeliveredYears(row: MetaAdInsightRow, years: number[] | undefined) {
  if (!years?.length) return
  const cur = row.deliveredYears || []
  const next = [...cur]
  for (const y of years) {
    if (y >= 2000 && y <= 2100 && !next.includes(y)) next.push(y)
  }
  row.deliveredYears = next
}

function yearFromMetaClock(raw: string | number | undefined | null): number | null {
  if (raw == null || raw === "") return null
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000
    const y = new Date(ms).getUTCFullYear()
    return y >= 2000 && y <= 2100 ? y : null
  }
  const s = String(raw).trim()
  if (!s) return null
  const iso = s.match(/^(20\d{2})(?:[-T\s]|$)/)
  if (iso) return Number(iso[1])
  if (/^\d{9,13}$/.test(s)) {
    const n = Number(s)
    const ms = n > 1e12 ? n : n * 1000
    const y = new Date(ms).getUTCFullYear()
    return y >= 2000 && y <= 2100 ? y : null
  }
  const t = Date.parse(s)
  if (Number.isFinite(t)) {
    const y = new Date(t).getUTCFullYear()
    return y >= 2000 && y <= 2100 ? y : null
  }
  return null
}

/**
 * 캠페인 단위 insights 실적을 채운다.
 * ad 단위에 이미 집행 행이 있으면 건너뛰고, 카탈로그(฿0)만 있는 IG/FB 부스트에 spend를 넣는다.
 */
export function applyCampaignInsightMetrics(
  ads: MetaAdInsightRow[],
  rows: Record<string, unknown>[] | undefined,
  deliveryYears?: number[]
): number {
  const hasAdLevel = new Set(
    ads
      .filter(
        (a) =>
          String(a.adId || "").trim() ||
          (Number(a.spend) || 0) > 0 ||
          (Number(a.impressions) || 0) > 0 ||
          (Number(a.reach) || 0) > 0
      )
      .map((a) => String(a.campaignId || "").trim())
      .filter(Boolean)
  )
  let updated = 0
  for (const row of rows || []) {
    const id = String(row.campaign_id || row.id || "").trim()
    if (!id || hasAdLevel.has(id)) continue
    const spend = num(row.spend)
    const impressions = num(row.impressions)
    const reach = num(row.reach)
    const clicks = num(row.clicks)
    if (spend <= 0 && impressions <= 0 && reach <= 0 && clicks <= 0) continue
    const name = String(row.campaign_name || row.name || id).trim()
    const existing = ads.find(
      (a) => String(a.campaignId || "").trim() === id && !String(a.adId || "").trim()
    )
    if (existing) {
      existing.spend = spend
      existing.impressions = impressions
      existing.reach = reach
      existing.clicks = clicks
      existing.ctr = num(row.ctr)
      if (name) existing.campaignName = name
      markDeliveredYears(existing, deliveryYears)
    } else {
      const item: MetaAdInsightRow = {
        adId: "",
        adName: "",
        campaignId: id,
        campaignName: name,
        impressions,
        reach,
        clicks,
        ctr: num(row.ctr),
        spend,
      }
      markDeliveredYears(item, deliveryYears)
      ads.push(item)
    }
    hasAdLevel.add(id)
    updated += 1
  }
  return updated
}

/** 캠페인 카탈로그를 매핑 목록에 합친다. 이미 있는 ID의 실적은 유지하고, 생성 시각만 비어 있으면 채운다. */
export function appendMetaCampaignCatalog(
  ads: MetaAdInsightRow[],
  rows: { id?: string; name?: string; created_time?: string; updated_time?: string }[] | undefined,
  opts?: { createdTimeFallback?: string; deliveredYear?: number }
): number {
  const fallback = String(opts?.createdTimeFallback || "").trim()
  const deliveredYear = opts?.deliveredYear
  const createdById = new Map<string, string>()
  const updatedYearsById = new Map<string, number[]>()
  const rowIds = new Set<string>()
  for (const c of rows || []) {
    const id = String(c.id || "").trim()
    if (!id) continue
    rowIds.add(id)
    const created = String(c.created_time || "").trim() || fallback
    if (created) createdById.set(id, created)
    const years: number[] = []
    if (deliveredYear) years.push(deliveredYear)
    const updatedY = yearFromMetaClock(c.updated_time)
    if (updatedY != null) years.push(updatedY)
    if (years.length) updatedYearsById.set(id, years)
  }
  const markRow = (a: MetaAdInsightRow, id: string) => {
    if (!a.createdTime && createdById.has(id)) a.createdTime = createdById.get(id)
    markDeliveredYears(a, updatedYearsById.get(id))
  }
  for (const a of ads) {
    const id = String(a.campaignId || "").trim()
    if (!id || !rowIds.has(id)) continue
    markRow(a, id)
  }
  const seen = new Set(ads.map((a) => String(a.campaignId || "").trim()).filter(Boolean))
  let added = 0
  for (const c of rows || []) {
    const id = String(c.id || "").trim()
    const name = String(c.name || "").trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const row: MetaAdInsightRow = {
      adId: "",
      adName: "",
      campaignId: id,
      campaignName: name || id,
      impressions: 0,
      reach: 0,
      clicks: 0,
      ctr: 0,
      spend: 0,
      createdTime: createdById.get(id),
    }
    markRow(row, id)
    ads.push(row)
    added += 1
  }
  return added
}

export type MetaPageInsightTotals = {
  postEngagement: number
  newFollows: number
  pageViews: number
}

export type MetaInstagramAccount = {
  id: string
  username: string
}

export type MetaPlatformSpend = {
  facebook: number
  instagram: number
  other: number
}

export type MetaSyncPayload = {
  syncedAt: string
  tokenKind: "page" | "user" | "env" | "unknown"
  pageId: string
  pageName: string
  adAccountId: string
  grantedScopes: string[]
  ads: MetaAdInsightRow[]
  adsTotals: { ads: number; impressions: number; reach: number; spend: number }
  pageInsights: MetaPageInsightTotals
  instagram: MetaInstagramAccount | null
  platformSpend: MetaPlatformSpend
  dateRange: { since?: string; until?: string; preset?: string }
  diagnostics: string[]
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

export async function fetchMetaAdsAndPageInsights(params: {
  pageToken: string
  userToken?: string
  pageId: string
  pageName: string
  adAccountId: string
  tokenKind: MetaSyncPayload["tokenKind"]
  grantedScopes: string[]
  since?: string
  until?: string
}): Promise<MetaSyncPayload> {
  const diagnostics: string[] = []
  const ads: MetaAdInsightRow[] = []
  const pageInsights: MetaPageInsightTotals = { postEngagement: 0, newFollows: 0, pageViews: 0 }
  const adsToken = params.userToken || params.pageToken
  const since = String(params.since || "").trim()
  const until = String(params.until || "").trim()
  const dateQuery: Record<string, string> =
    since && until
      ? { time_range: JSON.stringify({ since, until }) }
      : { date_preset: "last_28d" }
  const dateRange: { since?: string; until?: string; preset?: string } =
    since && until ? { since, until } : { preset: "last_28d" }

  if (!params.grantedScopes.includes("read_insights") && params.tokenKind !== "env") {
    diagnostics.push("missing_scope:read_insights")
  }
  if (!params.grantedScopes.includes("ads_read") && params.tokenKind !== "env") {
    diagnostics.push("missing_scope:ads_read")
  }
  if (params.tokenKind === "user") {
    diagnostics.push("page_insights_need_page_token")
  }

  let instagram: MetaInstagramAccount | null = null
  if (params.pageId && params.pageToken) {
    const ig = await metaGraphGet<{
      instagram_business_account?: { id?: string; username?: string }
    }>(params.pageId, params.pageToken, {
      fields: "instagram_business_account{id,username}",
    })
    if (ig.ok && ig.json?.instagram_business_account?.id) {
      instagram = {
        id: String(ig.json.instagram_business_account.id),
        username: String(ig.json.instagram_business_account.username || ""),
      }
    } else if (!ig.ok) {
      diagnostics.push(`instagram_link:${ig.error?.message || "error"}`)
    } else {
      diagnostics.push("instagram_not_linked")
    }
  }

  const platformSpend: MetaPlatformSpend = { facebook: 0, instagram: 0, other: 0 }
  const act = normalizeAdAccountId(params.adAccountId)
  if (act) {
    const insightFields =
      "ad_id,ad_name,campaign_id,campaign_name,impressions,reach,clicks,ctr,spend"
    const pushInsightRows = (
      rows: Record<string, unknown>[] | undefined,
      deliveryYears?: number[]
    ) => {
      for (const row of rows || []) {
        const item: MetaAdInsightRow = {
          adId: String(row.ad_id || ""),
          adName: String(row.ad_name || ""),
          campaignId: String(row.campaign_id || ""),
          campaignName: String(row.campaign_name || ""),
          impressions: num(row.impressions),
          reach: num(row.reach),
          clicks: num(row.clicks),
          ctr: num(row.ctr),
          spend: num(row.spend),
        }
        markDeliveredYears(item, deliveryYears)
        ads.push(item)
      }
    }

    const notePages = (label: string, pages: number, truncated: boolean, error: MetaGraphError | null) => {
      if (pages > 1) diagnostics.push(`${label}_pages:${pages}`)
      if (truncated) diagnostics.push(`${label}_truncated`)
      if (error) diagnostics.push(`${label}_page:${error.message || "error"}`)
    }

    const insightYears = yearsCoveredByMetaRange({
      since,
      until,
      preset: dateRange.preset,
    })
    const adInsights = await metaGraphGetAllPages<Record<string, unknown>>(`${act}/insights`, adsToken, {
      level: "ad",
      ...dateQuery,
      fields: insightFields,
      limit: META_GRAPH_PAGE_LIMIT,
    })
    if (!adInsights.ok) {
      diagnostics.push(`ads_insights:${adInsights.error?.message || "error"}`)
    } else {
      pushInsightRows(adInsights.data, insightYears)
      notePages("ads_insights", adInsights.pages, adInsights.truncated, adInsights.error)
    }

    // 광고 집행 실적이 없어도 캠페인 목록은 가져와 매핑에 쓴다.
    if (!ads.length) {
      const campInsights = await metaGraphGetAllPages<Record<string, unknown>>(`${act}/insights`, adsToken, {
        level: "campaign",
        ...dateQuery,
        fields: "campaign_id,campaign_name,impressions,reach,clicks,ctr,spend",
        limit: META_GRAPH_PAGE_LIMIT,
      })
      if (campInsights.ok) {
        for (const row of campInsights.data || []) {
          const item: MetaAdInsightRow = {
            adId: "",
            adName: "",
            campaignId: String(row.campaign_id || ""),
            campaignName: String(row.campaign_name || ""),
            impressions: num(row.impressions),
            reach: num(row.reach),
            clicks: num(row.clicks),
            ctr: num(row.ctr),
            spend: num(row.spend),
          }
          markDeliveredYears(item, insightYears)
          ads.push(item)
        }
        notePages("ads_insights_campaign", campInsights.pages, campInsights.truncated, campInsights.error)
      } else if (!adInsights.ok) {
        diagnostics.push(`ads_insights_campaign:${campInsights.error?.message || "error"}`)
      }
    }

    // last_28d가 비면 last_90d 한 번 더 (실적 없는 계정이면 여전히 0)
    if (!ads.length && !(since && until)) {
      const fallback = await metaGraphGetAllPages<Record<string, unknown>>(`${act}/insights`, adsToken, {
        level: "ad",
        date_preset: "last_90d",
        fields: insightFields,
        limit: META_GRAPH_PAGE_LIMIT,
      })
      if (fallback.ok && fallback.data.length) {
        dateRange.preset = "last_90d"
        pushInsightRows(
          fallback.data,
          yearsCoveredByMetaRange({ preset: "last_90d", until: bangkokTodayYmd() })
        )
        diagnostics.push("ads_insights_fallback:last_90d")
        notePages("ads_insights", fallback.pages, fallback.truncated, fallback.error)
      }
    }

    const today = bangkokTodayYmd()
    const yearStart = `${today.slice(0, 4)}-01-01`
    const yearStartUnix = Math.floor(new Date(`${yearStart}T00:00:00+07:00`).getTime() / 1000) - 1
    const campaignFields = "id,name,status,effective_status,created_time,updated_time"
    const mergeCatalog = async (
      label: string,
      query: Record<string, string | undefined>,
      catalogOpts?: { createdTimeFallback?: string; deliveredYear?: number }
    ): Promise<number | null> => {
      const page = await metaGraphGetAllPages<{
        id?: string
        name?: string
        created_time?: string
        updated_time?: string
      }>(`${act}/campaigns`, adsToken, query)
      if (!page.ok) {
        diagnostics.push(`${label}:${page.error?.message || "error"}`)
        return null
      }
      notePages(label, page.pages, page.truncated, page.error)
      const added = appendMetaCampaignCatalog(ads, page.data, catalogOpts)
      if (added) diagnostics.push(`${label}_listed:${added}`)
      if (label === "ads_campaigns" && !(page.data || []).length) diagnostics.push("ads_campaigns_empty")
      return added
    }

    // 필터 없이 먼저(삭제·보관 제외가 Meta 기본). 이어서 종료·보관도 보탠다.
    await mergeCatalog("ads_campaigns", {
      fields: campaignFields,
      limit: META_GRAPH_PAGE_LIMIT,
    })
    await mergeCatalog("ads_campaigns_active", {
      fields: campaignFields,
      limit: META_GRAPH_PAGE_LIMIT,
      filtering: JSON.stringify([
        {
          field: "effective_status",
          operator: "IN",
          value: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "WITH_ISSUES"],
        },
      ]),
    })
    const createdThisYear = JSON.stringify([
      { field: "created_time", operator: "GREATER_THAN", value: yearStartUnix },
    ])
    const completedAdded = await mergeCatalog("ads_campaigns_completed", {
      fields: campaignFields,
      limit: META_GRAPH_PAGE_LIMIT,
      is_completed: "true",
      filtering: createdThisYear,
    })
    if (completedAdded == null) {
      await mergeCatalog("ads_campaigns_completed_all", {
        fields: campaignFields,
        limit: META_GRAPH_PAGE_LIMIT,
        is_completed: "true",
      })
    }
    await mergeCatalog("ads_campaigns_archived", {
      fields: campaignFields,
      limit: META_GRAPH_PAGE_LIMIT,
      filtering: JSON.stringify([
        { field: "effective_status", operator: "IN", value: ["ARCHIVED"] },
        { field: "created_time", operator: "GREATER_THAN", value: yearStartUnix },
      ]),
    })
    // 올해·최근 90일 집행 캠페인에 연도 태그를 붙인다. (last_28d에 없어도 2026 목록에 나오게)
    const deliveryYear = Number(today.slice(0, 4))
    const markSpendCatalog = async (
      label: string,
      query: Record<string, string | undefined>,
      years: number[]
    ) => {
      const page = await metaGraphGetAllPages<Record<string, unknown>>(`${act}/insights`, adsToken, query)
      if (!page.ok) {
        diagnostics.push(`${label}:${page.error?.message || "error"}`)
        return
      }
      notePages(label, page.pages, page.truncated, page.error)
      const rows = (page.data || []).map((row) => ({
        id: String(row.campaign_id || ""),
        name: String(row.campaign_name || ""),
      }))
      for (const y of years) {
        const added = appendMetaCampaignCatalog(ads, rows, { deliveredYear: y })
        if (added) diagnostics.push(`${label}_listed_${y}:${added}`)
      }
      // 이미 ads에 있는 ID에도 deliveredYears만 보강
      const ids = new Set(rows.map((r) => r.id).filter(Boolean))
      for (const a of ads) {
        const id = String(a.campaignId || "").trim()
        if (id && ids.has(id)) markDeliveredYears(a, years)
      }
      applyCampaignInsightMetrics(ads, page.data, years)
    }
    await markSpendCatalog(
      "ads_campaigns_ytd",
      {
        level: "campaign",
        time_range: JSON.stringify({ since: yearStart, until: today }),
        fields: "campaign_id,campaign_name,spend",
        limit: META_GRAPH_PAGE_LIMIT,
      },
      [deliveryYear]
    )
    await markSpendCatalog(
      "ads_campaigns_this_year",
      {
        level: "campaign",
        date_preset: "this_year",
        fields: "campaign_id,campaign_name,spend",
        limit: META_GRAPH_PAGE_LIMIT,
      },
      [deliveryYear]
    )
    await markSpendCatalog(
      "ads_campaigns_last_90d",
      {
        level: "campaign",
        date_preset: "last_90d",
        fields: "campaign_id,campaign_name,spend",
        limit: META_GRAPH_PAGE_LIMIT,
      },
      yearsCoveredByMetaRange({ preset: "last_90d", todayYmd: today })
    )

    // ad 단위에 빠진 캠페인 실적(특히 IG โพสต์ 부스트)을 campaign insights로 채운다.
    const campFill = await metaGraphGetAllPages<Record<string, unknown>>(`${act}/insights`, adsToken, {
      level: "campaign",
      ...dateQuery,
      fields: "campaign_id,campaign_name,impressions,reach,clicks,ctr,spend",
      limit: META_GRAPH_PAGE_LIMIT,
    })
    if (campFill.ok) {
      const filled = applyCampaignInsightMetrics(ads, campFill.data, insightYears)
      if (filled) diagnostics.push(`ads_campaign_metrics_filled:${filled}`)
      notePages("ads_campaign_metrics", campFill.pages, campFill.truncated, campFill.error)
    } else {
      diagnostics.push(`ads_campaign_metrics:${campFill.error?.message || "error"}`)
    }

    const plat = await metaGraphGet<{ data?: { publisher_platform?: string; spend?: unknown }[] }>(
      `${act}/insights`,
      adsToken,
      {
        ...(dateRange.preset === "last_90d"
          ? { date_preset: "last_90d" }
          : dateQuery),
        fields: "spend",
        breakdowns: "publisher_platform",
        limit: "20",
      }
    )
    if (plat.ok) {
      for (const row of plat.json?.data || []) {
        const p = String(row.publisher_platform || "").toLowerCase()
        const spend = num(row.spend)
        if (p === "instagram") platformSpend.instagram += spend
        else if (p === "facebook") platformSpend.facebook += spend
        else platformSpend.other += spend
      }
    }
  } else {
    diagnostics.push("no_ad_account_id")
  }

  if (params.pageId && params.pageToken) {
    // page_impressions 는 2025-11 폐기 → page_media_view. date_preset 은 Page Insights에 없음.
    const untilYmd = until || bangkokTodayYmd()
    const sinceYmd = since || addBangkokCalendarDays(untilYmd, -27)
    const pi = await metaGraphGet<{ data?: { name?: string; values?: { value?: unknown }[] }[] }>(
      `${params.pageId}/insights`,
      params.pageToken,
      {
        metric: "page_post_engagements,page_media_view,page_follows",
        period: "day",
        since: sinceYmd,
        until: untilYmd,
      }
    )
    if (!pi.ok) {
      diagnostics.push(`page_insights:${pi.error?.message || "error"}`)
    } else {
      const sumMetric = (name: string) => {
        const m = (pi.json?.data || []).find((x) => String(x.name || "") === name)
        const values = m?.values || []
        return values.reduce((acc, v) => acc + num(v.value), 0)
      }
      pageInsights.postEngagement = sumMetric("page_post_engagements")
      pageInsights.pageViews = sumMetric("page_media_view")
      pageInsights.newFollows = sumMetric("page_follows")
      if (
        pageInsights.postEngagement === 0 &&
        pageInsights.pageViews === 0 &&
        pageInsights.newFollows === 0
      ) {
        diagnostics.push("page_insights_all_zero")
      }
    }
  }

  const adsTotals = ads.reduce(
    (acc, a) => {
      // 캠페인 목록 폴백(실적 0)은 매핑용 — 광고 건수·합계에는 실적 있는 행만
      const hasDelivery = Boolean(a.adId) || a.impressions > 0 || a.spend > 0 || a.reach > 0 || a.clicks > 0
      if (hasDelivery) {
        acc.ads += 1
        acc.impressions += a.impressions
        acc.reach += a.reach
        acc.spend += a.spend
      }
      return acc
    },
    { ads: 0, impressions: 0, reach: 0, spend: 0 }
  )

  if (!adsTotals.ads && ads.some((a) => a.campaignId || a.campaignName)) {
    diagnostics.push("ads_insights_empty_campaigns_listed")
  } else if (adsTotals.ads > 0 && adsTotals.impressions === 0 && adsTotals.spend === 0) {
    diagnostics.push("ads_insights_all_zero")
  }

  return {
    syncedAt: new Date().toISOString(),
    tokenKind: params.tokenKind,
    pageId: params.pageId,
    pageName: params.pageName,
    adAccountId: act,
    grantedScopes: params.grantedScopes,
    ads,
    adsTotals,
    pageInsights,
    instagram,
    platformSpend,
    dateRange,
    diagnostics,
  }
}
