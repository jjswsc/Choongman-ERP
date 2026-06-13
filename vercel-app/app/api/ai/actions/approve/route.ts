import { NextRequest, NextResponse } from "next/server"
import { requireAiApprover } from "@/lib/ai/auth"
import { aiRateLimit } from "@/lib/ai/rate-limit"
import { getBangkokDateTimeString } from "@/lib/bangkok-time"
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter, supabaseUpdateByFilterReturning } from "@/lib/supabase-server"
import { executeAiAction, sanitizeAiActionPayloadScope } from "@/lib/ai/action-catalog"
import type { AiActionType } from "@/lib/ai/types"
import { logAiUsage } from "@/lib/ai/audit"
import { isAiRouteError } from "@/lib/ai/errors"
import { toAiActionResponseRow } from "@/lib/ai/action-response"

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const access = await requireAiApprover(req)
  if (!access.ok) return access.response

  const rl = aiRateLimit(`ai:approve:${access.scoped.name}:${access.scoped.store}`, 120, 60 * 60 * 1000)
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

  const requestId = Number(body.requestId || 0)
  const approve = Boolean(body.approve)
  const comment = body.comment == null ? "" : String(body.comment).trim().slice(0, 2000)
  if (!requestId) {
    return NextResponse.json(
      { error: "requestId is required", code: "AI_VALIDATION_ERROR" },
      { status: 400, headers }
    )
  }

  const now = getBangkokDateTimeString()
  const found = (await supabaseSelectFilter(
    "ai_action_requests",
    `id=eq.${requestId}`,
    {
      limit: 1,
      select: "id,status,action_type,reason,payload_json,preview,created_at,requested_by,requested_role,requested_store,approved_by,approved_at,executed_at,error_message",
    }
  )) as Record<string, unknown>[] | null
  const row = found?.[0]
  if (!row) {
    return NextResponse.json(
      { error: "request not found", code: "AI_REQUEST_NOT_FOUND" },
      { status: 404, headers }
    )
  }

  const currentStatus = String(row.status || "")
  if (currentStatus !== "pending_approval") {
    return NextResponse.json(
      { error: "request is not pending approval", code: "AI_APPROVAL_CONFLICT" },
      { status: 409, headers }
    )
  }

  if (!approve) {
    const rejected = (await supabaseUpdateByFilterReturning(
      "ai_action_requests",
      `id=eq.${requestId}&status=eq.pending_approval`,
      {
        status: "rejected",
        approved_by: access.scoped.name,
        approved_at: now,
        updated_at: now,
      }
    )) as Record<string, unknown>[] | null
    if (!rejected?.length) {
      return NextResponse.json(
        { error: "request is not pending approval", code: "AI_APPROVAL_CONFLICT" },
        { status: 409, headers }
      )
    }
    await supabaseInsert("ai_action_events", {
      request_id: requestId,
      event_type: "rejected",
      actor_name: access.scoped.name,
      actor_role: access.scoped.role,
      detail: comment || "rejected",
      created_at: now,
    })
    await logAiUsage({
      scoped: access.scoped,
      route: "/api/ai/actions/approve",
      success: true,
      note: `request=${requestId},approve=false`,
    })
    const updated = { ...row, status: "rejected", approved_by: access.scoped.name, approved_at: now }
    return NextResponse.json({ ok: true, request: toAiActionResponseRow(updated) }, { headers })
  }

  try {
    const approved = (await supabaseUpdateByFilterReturning("ai_action_requests", `id=eq.${requestId}&status=eq.pending_approval`, {
      status: "approved",
      approved_by: access.scoped.name,
      approved_at: now,
      updated_at: now,
    })) as Record<string, unknown>[] | null
    if (!approved?.length) {
      return NextResponse.json(
        { error: "request is not pending approval", code: "AI_APPROVAL_CONFLICT" },
        { status: 409, headers }
      )
    }
    await supabaseInsert("ai_action_events", {
      request_id: requestId,
      event_type: "approved",
      actor_name: access.scoped.name,
      actor_role: access.scoped.role,
      detail: comment || "approved",
      created_at: now,
    })

    const actionType = String(row.action_type || "").trim() as AiActionType
    const payload = sanitizeAiActionPayloadScope({
      actionType,
      payload: (row.payload_json as Record<string, unknown>) || {},
      scoped: {
        role: String(row.requested_role || ""),
        store: String(row.requested_store || ""),
      },
    })
    const exec = await executeAiAction({
      requestId,
      actionType,
      payload,
      scoped: access.scoped,
    })

    await supabaseUpdateByFilter("ai_action_requests", `id=eq.${requestId}`, {
      status: "executed",
      executed_at: now,
      execution_result_type: exec.resultType,
      execution_result_id: exec.resultId,
      updated_at: now,
    })
    await supabaseInsert("ai_action_events", {
      request_id: requestId,
      event_type: "executed",
      actor_name: access.scoped.name,
      actor_role: access.scoped.role,
      detail: `${exec.resultType}:${exec.resultId}`,
      created_at: now,
    })

    await logAiUsage({
      scoped: access.scoped,
      route: "/api/ai/actions/approve",
      success: true,
      note: `request=${requestId},approve=true`,
    })

    const updated = {
      ...row,
      status: "executed",
      approved_by: access.scoped.name,
      approved_at: now,
      executed_at: now,
      error_message: null,
      execution_result_type: exec.resultType,
      execution_result_id: exec.resultId,
    }
    return NextResponse.json({ ok: true, request: toAiActionResponseRow(updated) }, { headers })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    const code = isAiRouteError(e) ? e.code : "AI_VALIDATION_ERROR"
    const status = isAiRouteError(e) ? e.status : 500
    await supabaseUpdateByFilter("ai_action_requests", `id=eq.${requestId}`, {
      status: "failed",
      approved_by: access.scoped.name,
      approved_at: now,
      error_message: errMsg.slice(0, 500),
      updated_at: now,
    })
    await supabaseInsert("ai_action_events", {
      request_id: requestId,
      event_type: "failed",
      actor_name: access.scoped.name,
      actor_role: access.scoped.role,
      detail: errMsg.slice(0, 1000),
      created_at: now,
    })
    await logAiUsage({
      scoped: access.scoped,
      route: "/api/ai/actions/approve",
      success: false,
      note: errMsg,
    })
    return NextResponse.json({ error: errMsg, code }, { status, headers })
  }
}

