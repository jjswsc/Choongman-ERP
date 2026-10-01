import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { isSaasTenantQueryBlocked, resolveSaasTenantScope } from "@/lib/saas-tenant-scope"
import { syncTikTokConnection } from "@/lib/tiktok-connection-server"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, "marketing_tiktok_connections")) {
    return NextResponse.json({ success: false, message: "tenant_blocked" }, { status: 403 })
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { since?: string; until?: string }
    const payload = await syncTikTokConnection(tenantScope, {
      since: String(body.since || "").trim() || undefined,
      until: String(body.until || "").trim() || undefined,
    })
    return NextResponse.json({ success: true, payload })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
