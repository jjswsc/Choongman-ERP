import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getVerifiedAuth } from "@/lib/verify-auth"
import { canAccessAiCenter, canApproveAiActions } from "@/lib/permissions"
import type { AiScopedAuth } from "@/lib/ai/types"

export async function requireAiAccess(req: NextRequest): Promise<
  | { ok: true; scoped: AiScopedAuth }
  | { ok: false; response: NextResponse }
> {
  const auth = await getVerifiedAuth(req)
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const role = String(auth.role || "")
  if (!canAccessAiCenter(role)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
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
    return { ok: false, response: NextResponse.json({ error: "Approver role required" }, { status: 403 }) }
  }
  return access
}

