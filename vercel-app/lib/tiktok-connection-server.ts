import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseDeleteByFilter,
} from "@/lib/supabase-server"
import { decryptTikTokToken, encryptTikTokToken } from "@/lib/tiktok-token-crypto"
import {
  fetchTikTokAdInsights,
  tiktokEnvFallback,
  tiktokListAdvertisers,
  type TikTokSyncPayload,
} from "@/lib/tiktok-ads"
import {
  appendSaasTenantFilter,
  stampSaasTenantId,
  type SaasTenantScope,
} from "@/lib/saas-tenant-scope"

export type TikTokConnectionRow = {
  id: number
  tenant_id?: string | null
  advertiser_id?: string
  advertiser_name?: string
  access_token_enc?: string
  granted_scopes?: string
  last_synced_at?: string | null
  last_sync_json?: TikTokSyncPayload | Record<string, unknown>
}

export async function loadTikTokConnectionRow(
  tenantScope: SaasTenantScope
): Promise<TikTokConnectionRow | null> {
  const filter = appendSaasTenantFilter("id=gt.0", tenantScope, "marketing_tiktok_connections")
  const rows = (await supabaseSelectFilter("marketing_tiktok_connections", filter, {
    order: "updated_at.desc,id.desc",
    limit: 1,
  })) as TikTokConnectionRow[] | null
  return rows?.[0] || null
}

export function resolveTikTokLiveTokens(row: TikTokConnectionRow | null): {
  accessToken: string
  advertiserId: string
  advertiserName: string
  grantedScopes: string[]
  source: "oauth" | "env" | "none"
} {
  const env = tiktokEnvFallback()
  const oauthToken = row ? decryptTikTokToken(row.access_token_enc || "") : ""
  const accessToken = oauthToken || env.accessToken
  const advertiserId = (row?.advertiser_id || "").trim() || env.advertiserId
  const advertiserName = (row?.advertiser_name || "").trim()
  const scopes = String(row?.granted_scopes || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (row && oauthToken) {
    return {
      accessToken,
      advertiserId,
      advertiserName,
      grantedScopes: scopes,
      source: "oauth",
    }
  }
  if (env.accessToken) {
    return {
      accessToken: env.accessToken,
      advertiserId: env.advertiserId,
      advertiserName,
      grantedScopes: scopes,
      source: "env",
    }
  }
  return {
    accessToken: "",
    advertiserId: "",
    advertiserName: "",
    grantedScopes: [],
    source: "none",
  }
}

export async function upsertTikTokConnection(
  tenantScope: SaasTenantScope,
  patch: {
    advertiserId: string
    advertiserName: string
    accessToken: string
    grantedScopes: string
    lastSync?: TikTokSyncPayload | null
  }
): Promise<void> {
  const existing = await loadTikTokConnectionRow(tenantScope)
  const row = stampSaasTenantId(
    {
      advertiser_id: patch.advertiserId,
      advertiser_name: patch.advertiserName,
      access_token_enc: encryptTikTokToken(patch.accessToken),
      granted_scopes: patch.grantedScopes,
      last_synced_at: patch.lastSync?.syncedAt || null,
      last_sync_json: patch.lastSync || {},
      updated_at: new Date().toISOString(),
    },
    tenantScope
  )
  if (existing?.id) {
    await supabaseUpdateByFilter("marketing_tiktok_connections", `id=eq.${existing.id}`, row)
    return
  }
  await supabaseInsert("marketing_tiktok_connections", row)
}

export async function deleteTikTokConnection(tenantScope: SaasTenantScope): Promise<void> {
  const existing = await loadTikTokConnectionRow(tenantScope)
  if (!existing?.id) return
  await supabaseDeleteByFilter("marketing_tiktok_connections", `id=eq.${existing.id}`)
}

export async function syncTikTokConnection(
  tenantScope: SaasTenantScope,
  range?: { since?: string; until?: string }
): Promise<TikTokSyncPayload> {
  const empty = (diagnostics: string[]): TikTokSyncPayload => ({
    syncedAt: new Date().toISOString(),
    advertiserId: "",
    advertiserName: "",
    grantedScopes: [],
    ads: [],
    adsTotals: { ads: 0, impressions: 0, reach: 0, spend: 0 },
    dateRange: {},
    diagnostics,
  })

  const row = await loadTikTokConnectionRow(tenantScope)
  const live = resolveTikTokLiveTokens(row)
  if (!live.accessToken) return empty(["not_connected"])
  if (!live.advertiserId) return empty(["need_advertiser_pick"])

  let advertiserName = live.advertiserName
  if (!advertiserName) {
    const listed = await tiktokListAdvertisers(live.accessToken)
    const match = listed.advertisers.find((a) => a.id === live.advertiserId)
    advertiserName = match?.name || live.advertiserId
  }

  const payload = await fetchTikTokAdInsights({
    accessToken: live.accessToken,
    advertiserId: live.advertiserId,
    advertiserName,
    grantedScopes: live.grantedScopes,
    since: range?.since,
    until: range?.until,
  })

  if (live.source === "oauth") {
    await upsertTikTokConnection(tenantScope, {
      advertiserId: live.advertiserId,
      advertiserName,
      accessToken: live.accessToken,
      grantedScopes: live.grantedScopes.join(","),
      lastSync: payload,
    })
  }

  return payload
}
