import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { verifyToken, type JwtPayload } from "@/lib/jwt-auth"
import { resolveSaasModuleGateResponse } from "@/lib/saas/tenant-module-gate"
import { shouldEnforceSaasForAuth } from "@/lib/saas/saas-enforce"

export async function verifyBearerToken(req: NextRequest): Promise<JwtPayload | null> {
  const auth = req.headers.get("authorization") || ""
  const m = auth.match(/^Bearer\s+(\S+)/i)
  if (!m?.[1]) return null
  return verifyToken(m[1].trim())
}

/** tenantId 있을 때만 모듈 게이트. 충만(tenantId 없음) → null */
export async function saasGateForBearerAuth(
  auth: JwtPayload,
  pathname: string
): Promise<NextResponse | null> {
  if (!shouldEnforceSaasForAuth(auth.tenantId)) return null
  try {
    return await resolveSaasModuleGateResponse(auth, pathname)
  } catch (err) {
    console.warn("[saas-gate] bearer gate lookup failed (fail-closed)", {
      pathname,
      tenantId: auth.tenantId,
      err,
    })
    return NextResponse.json(
      {
        success: false,
        code: "saas_module_gate_unavailable",
        message: "SaaS 모듈 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        msg: "SaaS 모듈 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 503 }
    )
  }
}

export type BearerSaasGateResult =
  | { auth: JwtPayload; blocked: null }
  | { auth: null; blocked: NextResponse }
  | { auth: null; blocked: null }

export async function verifyBearerWithSaasGate(
  req: NextRequest,
  pathname: string
): Promise<BearerSaasGateResult> {
  const auth = await verifyBearerToken(req)
  if (!auth) return { auth: null, blocked: null }
  const blocked = await saasGateForBearerAuth(auth, pathname)
  if (blocked) return { auth: null, blocked }
  return { auth, blocked: null }
}
