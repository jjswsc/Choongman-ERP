import { apiFetchWithOffline } from "../api/fetch-offline"

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

export type MetaSyncPayload = {
  syncedAt: string
  tokenKind: string
  pageId: string
  pageName: string
  adAccountId: string
  grantedScopes: string[]
  ads: MetaAdInsightRow[]
  adsTotals: { ads: number; impressions: number; reach: number; spend: number }
  pageInsights: { postEngagement: number; newFollows: number; pageViews: number }
  diagnostics: string[]
}

export type MetaConnectionStatus = {
  connected: boolean
  source: "oauth" | "env" | "none"
  pageId?: string
  pageName?: string
  adAccountId?: string
  tokenKind?: string
  grantedScopes?: string[]
  lastSyncedAt?: string | null
  lastSync?: Partial<MetaSyncPayload>
  appConfigured?: boolean
  diagnostics?: string[]
}

export async function getMetaConnectionStatus() {
  const res = await apiFetchWithOffline("/api/meta/connection", { cache: "no-store" })
  return res.json() as Promise<MetaConnectionStatus>
}

export async function syncMetaAds() {
  const res = await apiFetchWithOffline("/api/meta/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
  return res.json() as Promise<{ success: boolean; message?: string; payload?: MetaSyncPayload }>
}

export async function disconnectMeta() {
  const res = await apiFetchWithOffline("/api/meta/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
