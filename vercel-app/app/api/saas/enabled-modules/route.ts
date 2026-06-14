import { NextRequest, NextResponse } from "next/server"
import { getVerifiedAuth } from "@/lib/verify-auth"
import { loadSaasEnabledModulesForAuth } from "@/lib/saas/tenant-module-gate"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const auth = await getVerifiedAuth(req, { skipSaasGate: true })
  if (!auth) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401, headers })
  }
  const modules = await loadSaasEnabledModulesForAuth(auth)
  const tenantId = String(auth.tenantId || "").trim() || null
  return NextResponse.json({ success: true, tenantId, modules }, { headers })
}
