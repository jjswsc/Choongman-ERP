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
  let dateRange: { since?: string; until?: string; preset?: string } =
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
    const pushInsightRows = (rows: Record<string, unknown>[] | undefined) => {
      for (const row of rows || []) {
        ads.push({
          adId: String(row.ad_id || ""),
          adName: String(row.ad_name || ""),
          campaignId: String(row.campaign_id || ""),
          campaignName: String(row.campaign_name || ""),
          impressions: num(row.impressions),
          reach: num(row.reach),
          clicks: num(row.clicks),
          ctr: num(row.ctr),
          spend: num(row.spend),
        })
      }
    }

    let insights = await metaGraphGet<{ data?: Record<string, unknown>[] }>(
      `${act}/insights`,
      adsToken,
      {
        level: "ad",
        ...dateQuery,
        fields: insightFields,
        limit: "200",
      }
    )
    if (!insights.ok) {
      diagnostics.push(`ads_insights:${insights.error?.message || "error"}`)
    } else {
      pushInsightRows(insights.json?.data)
    }

    // 광고 집행 실적이 없어도 캠페인 목록은 가져와 매핑에 쓴다.
    if (!ads.length) {
      const campInsights = await metaGraphGet<{ data?: Record<string, unknown>[] }>(
        `${act}/insights`,
        adsToken,
        {
          level: "campaign",
          ...dateQuery,
          fields: "campaign_id,campaign_name,impressions,reach,clicks,ctr,spend",
          limit: "200",
        }
      )
      if (campInsights.ok) {
        for (const row of campInsights.json?.data || []) {
          ads.push({
            adId: "",
            adName: "",
            campaignId: String(row.campaign_id || ""),
            campaignName: String(row.campaign_name || ""),
            impressions: num(row.impressions),
            reach: num(row.reach),
            clicks: num(row.clicks),
            ctr: num(row.ctr),
            spend: num(row.spend),
          })
        }
      } else if (!insights.ok) {
        diagnostics.push(`ads_insights_campaign:${campInsights.error?.message || "error"}`)
      }
    }

    // last_28d가 비면 last_90d 한 번 더 (실적 없는 계정이면 여전히 0)
    if (!ads.length && !(since && until)) {
      insights = await metaGraphGet<{ data?: Record<string, unknown>[] }>(
        `${act}/insights`,
        adsToken,
        {
          level: "ad",
          date_preset: "last_90d",
          fields: insightFields,
          limit: "200",
        }
      )
      if (insights.ok && (insights.json?.data || []).length) {
        pushInsightRows(insights.json?.data)
        dateRange.preset = "last_90d"
        diagnostics.push("ads_insights_fallback:last_90d")
      }
    }

    const campaigns = await metaGraphGet<{
      data?: { id?: string; name?: string; effective_status?: string; status?: string }[]
    }>(`${act}/campaigns`, adsToken, {
      fields: "id,name,status,effective_status",
      limit: "200",
      // ACTIVE + paused도 매핑용으로 포함
      filtering: JSON.stringify([
        {
          field: "effective_status",
          operator: "IN",
          value: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "WITH_ISSUES"],
        },
      ]),
    })
    if (!campaigns.ok) {
      diagnostics.push(`ads_campaigns:${campaigns.error?.message || "error"}`)
    } else {
      const seen = new Set(
        ads.map((a) => String(a.campaignId || "").trim()).filter(Boolean)
      )
      let added = 0
      for (const c of campaigns.json?.data || []) {
        const id = String(c.id || "").trim()
        const name = String(c.name || "").trim()
        if (!id || seen.has(id)) continue
        seen.add(id)
        ads.push({
          adId: "",
          adName: "",
          campaignId: id,
          campaignName: name || id,
          impressions: 0,
          reach: 0,
          clicks: 0,
          ctr: 0,
          spend: 0,
        })
        added += 1
      }
      if (added) diagnostics.push(`ads_campaigns_listed:${added}`)
      if (!(campaigns.json?.data || []).length) diagnostics.push("ads_campaigns_empty")
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
