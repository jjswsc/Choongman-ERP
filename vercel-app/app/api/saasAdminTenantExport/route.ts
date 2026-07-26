import { NextRequest, NextResponse } from "next/server"
import {
  assertTenantInScope,
  requireSaasControlPlane,
} from "@/lib/saas-control-plane-scope"
import { buildTenantExportBundle } from "@/lib/saas/saas-tenant-export-server"

export const dynamic = "force-dynamic"

/** 고객사 마스터·집계 export (비밀번호/TOTP 제외) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  const tenantId = String(req.nextUrl.searchParams.get("tenantId") || "").trim().toLowerCase()
  if (!tenantId) {
    return NextResponse.json({ success: false, message: "tenantId required" }, { status: 400, headers })
  }
  if (!(await assertTenantInScope(cp.scope, tenantId))) {
    return NextResponse.json({ success: false, message: "forbidden" }, { status: 403, headers })
  }

  try {
    const bundle = await buildTenantExportBundle(tenantId)
    const download = req.nextUrl.searchParams.get("download") === "1"
    if (download) {
      headers.set(
        "Content-Disposition",
        `attachment; filename="tenant-export-${tenantId}.json"`
      )
    }
    return NextResponse.json({ success: true, ...bundle }, { headers })
  } catch (e) {
    console.error("saasAdminTenantExport:", e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
