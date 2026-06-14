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
    console.warn("[saas-gate] bearer gate lookup failed", {
      pathname,
      tenantId: auth.tenantId,
      err,
    })
    return null
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
