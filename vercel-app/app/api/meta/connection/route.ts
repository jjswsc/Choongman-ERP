import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { isSaasTenantQueryBlocked, resolveSaasTenantScope } from "@/lib/saas-tenant-scope"
import { loadMetaConnectionRow, resolveLiveTokens } from "@/lib/meta-connection-server"
import { metaAppCredentials } from "@/lib/meta-graph"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, "marketing_meta_connections")) {
    return NextResponse.json({ connected: false, source: "none", diagnostics: ["tenant_blocked"] })
  }

  try {
    const row = await loadMetaConnectionRow(tenantScope)
    const live = resolveLiveTokens(row)
    const creds = metaAppCredentials()
    const lastSync = (row?.last_sync_json || {}) as Record<string, unknown>
    return NextResponse.json({
      connected: live.source !== "none",
      source: live.source,
      pageId: live.pageId,
      pageName: live.pageName,
      adAccountId: live.adAccountId,
      tokenKind: live.tokenKind,
      grantedScopes: live.grantedScopes,
      lastSyncedAt: row?.last_synced_at || lastSync.syncedAt || null,
      lastSync,
      appConfigured: Boolean(creds.appId && creds.appSecret),
      diagnostics: Array.isArray(lastSync.diagnostics) ? lastSync.diagnostics : [],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      connected: false,
      source: "none",
      diagnostics: [msg.includes("marketing_meta_connections") || msg.includes("42P01") ? "table_missing" : msg],
    })
  }
}
