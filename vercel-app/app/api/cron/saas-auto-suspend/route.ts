import { NextRequest, NextResponse } from "next/server"
import { runSaasAutoSuspendPass } from "@/lib/saas/saas-auto-suspend-server"
import { cronAuthErrorResponse, isCronAuthorized } from "@/lib/verify-cron-auth"
import { isServerSaasBrand } from "@/lib/app-brand-server"

/** Omni 전용 — 연체 유예 종료 고객사 자동 정지 (매일 방콕 새벽) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cronDenied = cronAuthErrorResponse(req, headers)
  if (cronDenied) return cronDenied
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401, headers })
  }

  if (!(await isServerSaasBrand())) {
    return NextResponse.json(
      { success: true, skipped: true, reason: "not_saas_brand" },
      { headers }
    )
  }

  try {
    const result = await runSaasAutoSuspendPass()
    return NextResponse.json({ success: true, ...result }, { headers })
  } catch (e) {
    console.error("saas-auto-suspend cron:", e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
