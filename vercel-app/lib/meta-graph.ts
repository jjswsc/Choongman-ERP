export const META_GRAPH_VERSION = "v21.0"
export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "read_insights",
  "ads_read",
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
}): Promise<MetaSyncPayload> {
  const diagnostics: string[] = []
  const ads: MetaAdInsightRow[] = []
  const pageInsights: MetaPageInsightTotals = { postEngagement: 0, newFollows: 0, pageViews: 0 }
  const adsToken = params.userToken || params.pageToken

  if (!params.grantedScopes.includes("read_insights") && params.tokenKind !== "env") {
    diagnostics.push("missing_scope:read_insights")
  }
  if (!params.grantedScopes.includes("ads_read") && params.tokenKind !== "env") {
    diagnostics.push("missing_scope:ads_read")
  }
  if (params.tokenKind === "user") {
    diagnostics.push("page_insights_need_page_token")
  }

  const act = normalizeAdAccountId(params.adAccountId)
  if (act) {
    const insights = await metaGraphGet<{ data?: Record<string, unknown>[] }>(
      `${act}/insights`,
      adsToken,
      {
        level: "ad",
        date_preset: "last_28d",
        fields: "ad_id,ad_name,campaign_name,impressions,reach,clicks,ctr,spend",
        limit: "200",
      }
    )
    if (!insights.ok) {
      diagnostics.push(`ads_insights:${insights.error?.message || "error"}`)
    } else {
      for (const row of insights.json?.data || []) {
        ads.push({
          adId: String(row.ad_id || ""),
          adName: String(row.ad_name || ""),
          campaignName: String(row.campaign_name || ""),
          impressions: num(row.impressions),
          reach: num(row.reach),
          clicks: num(row.clicks),
          ctr: num(row.ctr),
          spend: num(row.spend),
        })
      }
    }
  } else {
    diagnostics.push("no_ad_account_id")
  }

  if (params.pageId && params.pageToken) {
    const pi = await metaGraphGet<{ data?: { name?: string; values?: { value?: unknown }[] }[] }>(
      `${params.pageId}/insights`,
      params.pageToken,
      {
        metric: "page_post_engagements,page_impressions,page_follows",
        period: "day",
        date_preset: "last_28d",
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
      pageInsights.pageViews = sumMetric("page_impressions")
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
      acc.ads += 1
      acc.impressions += a.impressions
      acc.reach += a.reach
      acc.spend += a.spend
      return acc
    },
    { ads: 0, impressions: 0, reach: 0, spend: 0 }
  )

  if (adsTotals.ads > 0 && adsTotals.impressions === 0 && adsTotals.spend === 0) {
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
    diagnostics,
  }
}
