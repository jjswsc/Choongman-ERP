import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseDeleteByFilter,
} from "@/lib/supabase-server"
import { decryptMetaToken, encryptMetaToken } from "@/lib/meta-token-crypto"
import {
  fetchMetaAdsAndPageInsights,
  metaEnvFallback,
  metaGraphGet,
  normalizeAdAccountId,
  type MetaSyncPayload,
} from "@/lib/meta-graph"
import {
  appendSaasTenantFilter,
  stampSaasTenantId,
  type SaasTenantScope,
} from "@/lib/saas-tenant-scope"

export type MetaConnectionRow = {
  id: number
  tenant_id?: string | null
  page_id?: string
  page_name?: string
  ad_account_id?: string
  page_token_enc?: string
  user_token_enc?: string
  token_expires_at?: string | null
  granted_scopes?: string
  token_kind?: string
  last_synced_at?: string | null
  last_sync_json?: MetaSyncPayload | Record<string, unknown>
  ig_user_id?: string
  ig_username?: string
}

export async function loadMetaConnectionRow(tenantScope: SaasTenantScope): Promise<MetaConnectionRow | null> {
  const filter = appendSaasTenantFilter("id=gt.0", tenantScope, "marketing_meta_connections")
  const rows = (await supabaseSelectFilter("marketing_meta_connections", filter, {
    order: "updated_at.desc,id.desc",
    limit: 1,
  })) as MetaConnectionRow[] | null
  return rows?.[0] || null
}

export function resolveLiveTokens(row: MetaConnectionRow | null): {
  pageToken: string
  userToken: string
  pageId: string
  pageName: string
  adAccountId: string
  tokenKind: MetaSyncPayload["tokenKind"]
  grantedScopes: string[]
  source: "oauth" | "env" | "none"
} {
  const env = metaEnvFallback()
  const pageToken = (row ? decryptMetaToken(row.page_token_enc || "") : "") || env.accessToken
  const userToken = row ? decryptMetaToken(row.user_token_enc || "") : ""
  const pageId = (row?.page_id || "").trim() || env.pageId
  const pageName = (row?.page_name || "").trim()
  const adAccountId = (row?.ad_account_id || "").trim() || env.adAccountId
  const scopes = String(row?.granted_scopes || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (row && (decryptMetaToken(row.page_token_enc || "") || decryptMetaToken(row.user_token_enc || ""))) {
    return {
      pageToken,
      userToken,
      pageId,
      pageName,
      adAccountId,
      tokenKind: (row.token_kind as MetaSyncPayload["tokenKind"]) || "page",
      grantedScopes: scopes,
      source: "oauth",
    }
  }
  if (env.accessToken) {
    return {
      pageToken: env.accessToken,
      userToken: "",
      pageId: env.pageId,
      pageName: pageName || "",
      adAccountId: env.adAccountId,
      tokenKind: "env",
      grantedScopes: scopes,
      source: "env",
    }
  }
  return {
    pageToken: "",
    userToken: "",
    pageId: "",
    pageName: "",
    adAccountId: "",
    tokenKind: "unknown",
    grantedScopes: [],
    source: "none",
  }
}

export async function upsertMetaConnection(
  tenantScope: SaasTenantScope,
  patch: {
    pageId: string
    pageName: string
    adAccountId: string
    pageToken: string
    userToken?: string
    tokenKind: string
    grantedScopes: string
    lastSync?: MetaSyncPayload | null
  }
): Promise<void> {
  const existing = await loadMetaConnectionRow(tenantScope)
  const row = stampSaasTenantId(
    {
      page_id: patch.pageId,
      page_name: patch.pageName,
      ad_account_id: normalizeAdAccountId(patch.adAccountId),
      page_token_enc: encryptMetaToken(patch.pageToken),
      user_token_enc: encryptMetaToken(patch.userToken || ""),
      granted_scopes: patch.grantedScopes,
      token_kind: patch.tokenKind,
      last_synced_at: patch.lastSync?.syncedAt || null,
      last_sync_json: patch.lastSync || {},
      updated_at: new Date().toISOString(),
    },
    tenantScope
  )
  if (existing?.id) {
    await supabaseUpdateByFilter("marketing_meta_connections", `id=eq.${existing.id}`, row)
    return
  }
  await supabaseInsert("marketing_meta_connections", row)
}

export async function deleteMetaConnection(tenantScope: SaasTenantScope): Promise<void> {
  const existing = await loadMetaConnectionRow(tenantScope)
  if (!existing?.id) return
  await supabaseDeleteByFilter("marketing_meta_connections", `id=eq.${existing.id}`)
}

export async function syncMetaConnection(
  tenantScope: SaasTenantScope,
  range?: { since?: string; until?: string }
): Promise<MetaSyncPayload> {
  const empty = (diagnostics: string[]): MetaSyncPayload => ({
    syncedAt: new Date().toISOString(),
    tokenKind: "unknown",
    pageId: "",
    pageName: "",
    adAccountId: "",
    grantedScopes: [],
    ads: [],
    adsTotals: { ads: 0, impressions: 0, reach: 0, spend: 0 },
    pageInsights: { postEngagement: 0, newFollows: 0, pageViews: 0 },
    instagram: null,
    platformSpend: { facebook: 0, instagram: 0, other: 0 },
    dateRange: {},
    diagnostics,
  })
  const row = await loadMetaConnectionRow(tenantScope)
  const live = resolveLiveTokens(row)
  if (!live.pageToken && !live.userToken) {
    return empty(["not_connected"])
  }

  let pageId = live.pageId
  let pageName = live.pageName
  let adAccountId = live.adAccountId
  let pageToken = live.pageToken
  const userToken = live.userToken

  if (!pageId) {
    return empty(["need_page_pick"])
  }

  if (pageId && !pageName) {
    const pg = await metaGraphGet<{ name?: string }>(pageId, pageToken || userToken, { fields: "name" })
    pageName = String(pg.json?.name || "")
  }

  if (!adAccountId && (userToken || pageToken)) {
    const acts = await metaGraphGet<{ data?: { id?: string }[] }>("me/adaccounts", userToken || pageToken, {
      fields: "id",
      limit: "5",
    })
    adAccountId = String(acts.json?.data?.[0]?.id || "")
  }

  const payload = await fetchMetaAdsAndPageInsights({
    pageToken: pageToken || userToken,
    userToken: userToken || undefined,
    pageId,
    pageName,
    adAccountId,
    tokenKind: live.tokenKind,
    grantedScopes: live.grantedScopes,
    since: range?.since,
    until: range?.until,
  })

  if (live.source === "oauth") {
    await upsertMetaConnection(tenantScope, {
      pageId,
      pageName,
      adAccountId,
      pageToken: pageToken || userToken,
      userToken,
      tokenKind: live.tokenKind,
      grantedScopes: live.grantedScopes.join(","),
      lastSync: payload,
    })
  }

  return payload
}
