import { bangkokInclusivePeriod, bangkokTodayYmd } from "@/lib/bangkok-date"

export const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3"
export const TIKTOK_AUTH_URL = "https://business-api.tiktok.com/portal/auth"

export type TikTokApiError = { code?: number; message?: string }

export type TikTokAdInsightRow = {
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

export type TikTokSyncPayload = {
  syncedAt: string
  advertiserId: string
  advertiserName: string
  grantedScopes: string[]
  ads: TikTokAdInsightRow[]
  adsTotals: { ads: number; impressions: number; reach: number; spend: number }
  dateRange: { since?: string; until?: string; preset?: string }
  diagnostics: string[]
}

export function tiktokAppCredentials(): { appId: string; appSecret: string } {
  return {
    appId: String(process.env.TIKTOK_APP_ID || "").trim(),
    appSecret: String(process.env.TIKTOK_APP_SECRET || "").trim(),
  }
}

export function tiktokEnvFallback(): { accessToken: string; advertiserId: string } {
  return {
    accessToken: String(process.env.TIKTOK_ACCESS_TOKEN || "").trim(),
    advertiserId: String(
      process.env.TIKTOK_ADVERTISER_ID || process.env.TIKTOK_ADS_ACCOUNT_ID || ""
    ).trim(),
  }
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

export function defaultTikTokReportRange(params?: {
  since?: string
  until?: string
}): { since: string; until: string; preset?: string } {
  const since = String(params?.since || "").trim()
  const until = String(params?.until || "").trim()
  if (since && until) return { since, until }
  const end = bangkokTodayYmd()
  const { startYmd, endYmd } = bangkokInclusivePeriod(end, 28)
  return { since: startYmd, until: endYmd, preset: "last_28d_bangkok" }
}

export async function tiktokApiGet<T = unknown>(
  path: string,
  accessToken: string,
  query?: Record<string, string | undefined>
): Promise<{ ok: boolean; json: T | null; error: TikTokApiError | null; status: number }> {
  const url = new URL(`${TIKTOK_API_BASE}/${path.replace(/^\//, "")}`)
  for (const [k, v] of Object.entries(query || {})) {
    if (v != null && v !== "") url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: { "Access-Token": accessToken },
  })
  const json = (await res.json().catch(() => null)) as {
    code?: number
    message?: string
    data?: T
  } | null
  if (!res.ok || (json && typeof json.code === "number" && json.code !== 0)) {
    return {
      ok: false,
      json: null,
      error: { code: json?.code, message: json?.message || `HTTP ${res.status}` },
      status: res.status,
    }
  }
  return { ok: true, json: (json?.data as T) ?? null, error: null, status: res.status }
}

export async function tiktokExchangeAccessToken(authCode: string): Promise<{
  ok: boolean
  accessToken: string
  advertiserIds: string[]
  scope: string[]
  error: string
}> {
  const { appId, appSecret } = tiktokAppCredentials()
  if (!appId || !appSecret) {
    return { ok: false, accessToken: "", advertiserIds: [], scope: [], error: "config" }
  }
  const res = await fetch(`${TIKTOK_API_BASE}/oauth2/access_token/`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      secret: appSecret,
      auth_code: authCode,
    }),
  })
  const json = (await res.json().catch(() => null)) as {
    code?: number
    message?: string
    data?: {
      access_token?: string
      advertiser_ids?: Array<string | number>
      scope?: Array<string | number>
    }
  } | null
  if (!res.ok || !json || json.code !== 0 || !json.data?.access_token) {
    return {
      ok: false,
      accessToken: "",
      advertiserIds: [],
      scope: [],
      error: json?.message || `HTTP ${res.status}`,
    }
  }
  const advertiserIds = (json.data.advertiser_ids || []).map((id) => String(id)).filter(Boolean)
  const scope = (json.data.scope || []).map((s) => String(s)).filter(Boolean)
  return {
    ok: true,
    accessToken: String(json.data.access_token),
    advertiserIds,
    scope,
    error: "",
  }
}

export async function tiktokListAdvertisers(accessToken: string): Promise<{
  ok: boolean
  advertisers: { id: string; name: string }[]
  error: string
}> {
  const { appId, appSecret } = tiktokAppCredentials()
  if (!appId || !appSecret) {
    return { ok: false, advertisers: [], error: "config" }
  }
  const url = new URL(`${TIKTOK_API_BASE}/oauth2/advertiser/get/`)
  url.searchParams.set("app_id", appId)
  url.searchParams.set("secret", appSecret)
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: { "Access-Token": accessToken },
  })
  const json = (await res.json().catch(() => null)) as {
    code?: number
    message?: string
    data?: { list?: { advertiser_id?: string | number; advertiser_name?: string }[] }
  } | null
  if (!res.ok || !json || json.code !== 0) {
    return { ok: false, advertisers: [], error: json?.message || `HTTP ${res.status}` }
  }
  const advertisers = (json.data?.list || [])
    .filter((a) => a?.advertiser_id != null)
    .map((a) => ({
      id: String(a.advertiser_id),
      name: String(a.advertiser_name || a.advertiser_id),
    }))
  return { ok: true, advertisers, error: "" }
}

export async function fetchTikTokAdInsights(params: {
  accessToken: string
  advertiserId: string
  advertiserName: string
  grantedScopes: string[]
  since?: string
  until?: string
}): Promise<TikTokSyncPayload> {
  const diagnostics: string[] = []
  const ads: TikTokAdInsightRow[] = []
  const range = defaultTikTokReportRange({ since: params.since, until: params.until })
  const advertiserId = String(params.advertiserId || "").trim()

  if (!advertiserId) {
    return {
      syncedAt: new Date().toISOString(),
      advertiserId: "",
      advertiserName: params.advertiserName || "",
      grantedScopes: params.grantedScopes,
      ads: [],
      adsTotals: { ads: 0, impressions: 0, reach: 0, spend: 0 },
      dateRange: range,
      diagnostics: ["no_advertiser_id"],
    }
  }

  const report = await tiktokApiGet<{
    list?: Record<string, unknown>[]
    page_info?: { total_number?: number }
  }>("report/integrated/get/", params.accessToken, {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    data_level: "AUCTION_AD",
    dimensions: JSON.stringify(["ad_id"]),
    metrics: JSON.stringify([
      "spend",
      "impressions",
      "clicks",
      "ctr",
      "reach",
      "campaign_name",
      "ad_name",
      "campaign_id",
    ]),
    start_date: range.since,
    end_date: range.until,
    page: "1",
    page_size: "200",
  })

  if (!report.ok) {
    // Some apps reject campaign_name/ad_name as metrics — retry metrics-only.
    const retry = await tiktokApiGet<{ list?: Record<string, unknown>[] }>(
      "report/integrated/get/",
      params.accessToken,
      {
        advertiser_id: advertiserId,
        report_type: "BASIC",
        data_level: "AUCTION_AD",
        dimensions: JSON.stringify(["ad_id"]),
        metrics: JSON.stringify(["spend", "impressions", "clicks", "ctr", "reach"]),
        start_date: range.since,
        end_date: range.until,
        page: "1",
        page_size: "200",
      }
    )
    if (!retry.ok) {
      diagnostics.push(`ads_insights:${report.error?.message || retry.error?.message || "error"}`)
    } else {
      for (const row of retry.json?.list || []) {
        const metrics = (row.metrics || row) as Record<string, unknown>
        const dimensions = (row.dimensions || {}) as Record<string, unknown>
        ads.push({
          adId: String(dimensions.ad_id || metrics.ad_id || ""),
          adName: String(metrics.ad_name || dimensions.ad_id || ""),
          campaignId: String(metrics.campaign_id || ""),
          campaignName: String(metrics.campaign_name || ""),
          impressions: num(metrics.impressions),
          reach: num(metrics.reach),
          clicks: num(metrics.clicks),
          ctr: num(metrics.ctr),
          spend: num(metrics.spend),
        })
      }
      if (report.error?.message) diagnostics.push(`ads_insights_metrics_fallback:${report.error.message}`)
    }
  } else {
    for (const row of report.json?.list || []) {
      const metrics = (row.metrics || row) as Record<string, unknown>
      const dimensions = (row.dimensions || {}) as Record<string, unknown>
      ads.push({
        adId: String(dimensions.ad_id || metrics.ad_id || ""),
        adName: String(metrics.ad_name || dimensions.ad_id || ""),
        campaignId: String(metrics.campaign_id || ""),
        campaignName: String(metrics.campaign_name || ""),
        impressions: num(metrics.impressions),
        reach: num(metrics.reach),
        clicks: num(metrics.clicks),
        ctr: num(metrics.ctr),
        spend: num(metrics.spend),
      })
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
    advertiserId,
    advertiserName: params.advertiserName || "",
    grantedScopes: params.grantedScopes,
    ads,
    adsTotals,
    dateRange: range,
    diagnostics,
  }
}
