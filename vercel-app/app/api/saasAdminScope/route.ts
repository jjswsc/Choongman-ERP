import { NextRequest, NextResponse } from "next/server"
import { requireSaasControlPlane, saasScopeToClientMeta } from "@/lib/saas-control-plane-scope"

/**
 * SaaS 관리 UI 스코프만 반환 — getSaasTenantSettings(고객사 전체·usage·audit)를
 * layout에서 반복 호출하지 않도록 경량 분리.
 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  headers.set("Cache-Control", "private, max-age=30")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  return NextResponse.json(
    { success: true, scope: saasScopeToClientMeta(cp.scope) },
    { headers }
  )
}
