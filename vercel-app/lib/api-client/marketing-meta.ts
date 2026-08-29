import { apiFetchWithOffline } from "../api/fetch-offline"

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
  instagram?: { id: string; username: string } | null
  platformSpend?: { facebook: number; instagram: number; other: number }
  dateRange?: { since?: string; until?: string; preset?: string }
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
  instagram?: { id: string; username: string } | null
  appConfigured?: boolean
  diagnostics?: string[]
  pendingPagePick?: boolean
}

export type MetaPageChoice = { id: string; name: string }

export async function getMetaConnectionStatus() {
  const res = await apiFetchWithOffline("/api/meta/connection", { cache: "no-store" })
  return res.json() as Promise<MetaConnectionStatus>
}

export async function syncMetaAds(params?: { since?: string; until?: string }) {
  const res = await apiFetchWithOffline("/api/meta/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      since: params?.since || "",
      until: params?.until || "",
    }),
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

export async function listMetaPages() {
  const res = await apiFetchWithOffline("/api/meta/pages", { cache: "no-store" })
  return res.json() as Promise<{
    pages: MetaPageChoice[]
    currentPageId?: string
    pendingPick?: boolean
  }>
}

export async function selectMetaPage(pageId: string) {
  const res = await apiFetchWithOffline("/api/meta/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageId }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; pageId?: string; pageName?: string }>
}
