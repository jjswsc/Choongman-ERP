import { NextRequest, NextResponse } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import { aiRateLimit } from "@/lib/ai/rate-limit"
import { sanitizeAiActionPayloadScope, validateAiActionInput } from "@/lib/ai/action-catalog"
import type { AiActionType } from "@/lib/ai/types"
import { getBangkokDateTimeString } from "@/lib/bangkok-time"
import { supabaseInsert } from "@/lib/supabase-server"
import { logAiUsage } from "@/lib/ai/audit"
import { isAiRouteError } from "@/lib/ai/errors"
import { toAiActionResponseRow } from "@/lib/ai/action-response"

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  const rl = aiRateLimit(`ai:propose:${access.scoped.name}:${access.scoped.store}`, 80, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", code: "AI_RATE_LIMITED", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers }
    )
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "AI_INVALID_JSON" }, { status: 400, headers })
  }

  try {
    const actionType = String(body.actionType || "").trim() as AiActionType
    const reason = String(body.reason || "").trim()
    const payload = sanitizeAiActionPayloadScope({
      actionType,
      payload: ((body.payload as Record<string, unknown>) || {}),
      scoped: access.scoped,
    })
    const validated = validateAiActionInput({ actionType, reason, payload })
    const now = getBangkokDateTimeString()

    const inserted = (await supabaseInsert("ai_action_requests", {
      status: "pending_approval",
      action_type: actionType,
      reason,
      payload_json: payload,
      preview: validated.preview,
      requested_by: access.scoped.name,
      requested_role: access.scoped.role,
      requested_store: access.scoped.store || "All",
      created_at: now,
      updated_at: now,
    })) as Record<string, unknown>[] | null

    const row = inserted?.[0]
    if (!row) throw new Error("failed to create request")

    await supabaseInsert("ai_action_events", {
      request_id: Number(row.id || 0),
      event_type: "proposed",
      actor_name: access.scoped.name,
      actor_role: access.scoped.role,
      detail: validated.preview,
      created_at: now,
    })

    await logAiUsage({
      scoped: access.scoped,
      route: "/api/ai/actions/propose",
      success: true,
      note: `action=${actionType}`,
    })

    return NextResponse.json({ request: toAiActionResponseRow(row) }, { headers })
  } catch (e) {
    const code = isAiRouteError(e) ? e.code : "AI_VALIDATION_ERROR"
    const status = isAiRouteError(e) ? e.status : 400
    await logAiUsage({
      scoped: access.scoped,
      route: "/api/ai/actions/propose",
      success: false,
      note: e instanceof Error ? e.message : String(e),
    })
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), code },
      { status, headers }
    )
  }
}

