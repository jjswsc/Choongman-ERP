import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { isSaasTenantQueryBlocked, resolveSaasTenantScope } from "@/lib/saas-tenant-scope"
import { applyMetaAutoMap } from "@/lib/marketing-ads-weekly-sync"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, "marketing_campaigns")) {
    return NextResponse.json({ success: false, message: "tenant_blocked" }, { status: 403 })
  }
  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean; syncFirst?: boolean }
  try {
    const result = await applyMetaAutoMap(tenantScope, {
      dryRun: body.dryRun === true,
      syncFirst: body.syncFirst !== false,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
