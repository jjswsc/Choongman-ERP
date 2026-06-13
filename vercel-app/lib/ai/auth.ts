import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getVerifiedAuth } from "@/lib/verify-auth"
import { canAccessAiCenter, canApproveAiActions } from "@/lib/permissions"
import type { AiScopedAuth } from "@/lib/ai/types"
import { isAiCenterModuleEnabledForAuth } from "@/lib/ai/tenant-gate"

export async function requireAiAccess(req: NextRequest): Promise<
  | { ok: true; scoped: AiScopedAuth }
  | { ok: false; response: NextResponse }
> {
  const auth = await getVerifiedAuth(req)
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized", code: "AI_UNAUTHORIZED" }, { status: 401 }),
    }
  }
  const role = String(auth.role || "")
  if (!canAccessAiCenter(role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden", code: "AI_FORBIDDEN" }, { status: 403 }),
    }
  }
  const moduleEnabled = await isAiCenterModuleEnabledForAuth(auth)
  if (!moduleEnabled) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "AI 센터 모듈이 이 고객사 계약에 포함되어 있지 않습니다.",
          code: "AI_FORBIDDEN",
        },
        { status: 403 }
      ),
    }
  }
  return {
    ok: true,
    scoped: {
      auth,
      role,
      name: String(auth.name || "").trim() || "unknown",
      store: String(auth.store || "").trim(),
    },
  }
}

export async function requireAiApprover(req: NextRequest): Promise<
  | { ok: true; scoped: AiScopedAuth }
  | { ok: false; response: NextResponse }
> {
  const access = await requireAiAccess(req)
  if (!access.ok) return access
  if (!canApproveAiActions(access.scoped.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Approver role required", code: "AI_APPROVER_REQUIRED" },
        { status: 403 }
      ),
    }
  }
  return access
}

