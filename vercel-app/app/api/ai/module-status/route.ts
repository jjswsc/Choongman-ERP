import { NextRequest, NextResponse } from "next/server"
import { getVerifiedAuth } from "@/lib/verify-auth"
import { canAccessAiCenter } from "@/lib/permissions"
import { isAiCenterModuleEnabledForAuth } from "@/lib/ai/tenant-gate"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const auth = await getVerifiedAuth(req)
  if (!auth) {
    return NextResponse.json({ enabled: false, reason: "unauthorized" }, { status: 401, headers })
  }
  if (!canAccessAiCenter(String(auth.role || ""))) {
    return NextResponse.json({ enabled: false, reason: "role" }, { headers })
  }
  const enabled = await isAiCenterModuleEnabledForAuth(auth)
  return NextResponse.json({ enabled, reason: enabled ? null : "module_disabled" }, { headers })
}
