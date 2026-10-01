import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { isSaasTenantQueryBlocked, resolveSaasTenantScope } from "@/lib/saas-tenant-scope"
import { loadTikTokConnectionRow, resolveTikTokLiveTokens } from "@/lib/tiktok-connection-server"
import { tiktokAppCredentials } from "@/lib/tiktok-ads"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, "marketing_tiktok_connections")) {
    return NextResponse.json({ connected: false, source: "none", diagnostics: ["tenant_blocked"] })
  }

  try {
    const row = await loadTikTokConnectionRow(tenantScope)
    const live = resolveTikTokLiveTokens(row)
    const creds = tiktokAppCredentials()
    const lastSync = (row?.last_sync_json || {}) as Record<string, unknown>
    return NextResponse.json({
      connected: live.source !== "none",
      source: live.source,
      advertiserId: live.advertiserId,
      advertiserName: live.advertiserName,
      grantedScopes: live.grantedScopes,
      lastSyncedAt: row?.last_synced_at || lastSync.syncedAt || null,
      lastSync,
      appConfigured: Boolean(creds.appId && creds.appSecret),
      pendingAdvertiserPick: live.source === "oauth" && !live.advertiserId,
      diagnostics: Array.isArray(lastSync.diagnostics) ? lastSync.diagnostics : [],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      connected: false,
      source: "none",
      diagnostics: [
        msg.includes("marketing_tiktok_connections") || msg.includes("42P01") ? "table_missing" : msg,
      ],
    })
  }
}
