import { NextRequest, NextResponse } from "next/server"
import { cronAuthErrorResponse, isCronAuthorized } from "@/lib/verify-cron-auth"
import { resolveSaasTenantScope } from "@/lib/saas-tenant-scope"
import { runMarketingAdsWeeklySync } from "@/lib/marketing-ads-weekly-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Meta/TikTok 광고 동기화 + 자동 매핑 + 예산 알림.
 * 방콕 월요일 09:00 ≈ UTC 02:00 Monday.
 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cronDenied = cronAuthErrorResponse(req, headers)
  if (cronDenied) return cronDenied
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401, headers })
  }

  try {
    const tenantScope = await resolveSaasTenantScope({ auth: null })
    const result = await runMarketingAdsWeeklySync(tenantScope)
    return NextResponse.json({ success: true, ...result }, { headers })
  } catch (e) {
    console.error("marketing-ads-sync cron:", e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
