import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { isSaasTenantQueryBlocked, resolveSaasTenantScope } from "@/lib/saas-tenant-scope"
import {
  loadTikTokConnectionRow,
  resolveTikTokLiveTokens,
  upsertTikTokConnection,
} from "@/lib/tiktok-connection-server"
import { tiktokEnvFallback, tiktokListAdvertisers } from "@/lib/tiktok-ads"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, "marketing_tiktok_connections")) {
    return NextResponse.json({ advertisers: [], currentAdvertiserId: "", pendingPick: false })
  }

  const row = await loadTikTokConnectionRow(tenantScope)
  const live = resolveTikTokLiveTokens(row)
  if (!live.accessToken) {
    return NextResponse.json({
      advertisers: [],
      currentAdvertiserId: live.advertiserId,
      pendingPick: false,
    })
  }

  const listed = await tiktokListAdvertisers(live.accessToken)
  return NextResponse.json({
    advertisers: listed.ok ? listed.advertisers : [],
    currentAdvertiserId: live.advertiserId,
    pendingPick: live.source === "oauth" && !live.advertiserId,
    error: listed.ok ? undefined : listed.error,
  })
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, "marketing_tiktok_connections")) {
    return NextResponse.json({ success: false, message: "tenant_blocked" }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { advertiserId?: string }
  const advertiserId = String(body.advertiserId || "").trim()
  if (!advertiserId) {
    return NextResponse.json({ success: false, message: "advertiserId required" }, { status: 400 })
  }

  const row = await loadTikTokConnectionRow(tenantScope)
  const live = resolveTikTokLiveTokens(row)
  if (!live.accessToken) {
    return NextResponse.json({ success: false, message: "not_connected" }, { status: 400 })
  }

  const listed = await tiktokListAdvertisers(live.accessToken)
  const picked =
    listed.advertisers.find((a) => a.id === advertiserId) ||
    (tiktokEnvFallback().advertiserId === advertiserId
      ? { id: advertiserId, name: advertiserId }
      : null)
  if (!picked) {
    return NextResponse.json({ success: false, message: "advertiser_not_found" }, { status: 404 })
  }

  await upsertTikTokConnection(tenantScope, {
    advertiserId: picked.id,
    advertiserName: picked.name,
    accessToken: live.accessToken,
    grantedScopes: live.grantedScopes.join(","),
    lastSync: null,
  })

  return NextResponse.json({
    success: true,
    advertiserId: picked.id,
    advertiserName: picked.name,
  })
}
