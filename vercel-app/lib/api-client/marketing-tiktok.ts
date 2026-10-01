import { apiFetchWithOffline } from "../api/fetch-offline"

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
  dateRange?: { since?: string; until?: string; preset?: string }
  diagnostics: string[]
}

export type TikTokConnectionStatus = {
  connected: boolean
  source: "oauth" | "env" | "none"
  advertiserId?: string
  advertiserName?: string
  grantedScopes?: string[]
  lastSyncedAt?: string | null
  lastSync?: Partial<TikTokSyncPayload>
  appConfigured?: boolean
  diagnostics?: string[]
  pendingAdvertiserPick?: boolean
}

export type TikTokAdvertiserChoice = { id: string; name: string }

export async function getTikTokConnectionStatus() {
  const res = await apiFetchWithOffline("/api/tiktok/connection", { cache: "no-store" })
  return res.json() as Promise<TikTokConnectionStatus>
}

export async function syncTikTokAds(params?: { since?: string; until?: string }) {
  const res = await apiFetchWithOffline("/api/tiktok/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      since: params?.since || "",
      until: params?.until || "",
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; payload?: TikTokSyncPayload }>
}

export async function disconnectTikTok() {
  const res = await apiFetchWithOffline("/api/tiktok/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function listTikTokAdvertisers() {
  const res = await apiFetchWithOffline("/api/tiktok/advertisers", { cache: "no-store" })
  return res.json() as Promise<{
    advertisers: TikTokAdvertiserChoice[]
    currentAdvertiserId?: string
    pendingPick?: boolean
    error?: string
  }>
}

export async function selectTikTokAdvertiser(advertiserId: string) {
  const res = await apiFetchWithOffline("/api/tiktok/advertisers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ advertiserId }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    advertiserId?: string
    advertiserName?: string
  }>
}
