import { NextRequest, NextResponse } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import { buildAiDataPolicy } from "@/lib/ai/policy"

function toResponseRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id || 0),
    status: String(row.status || "pending_approval"),
    actionType: String(row.action_type || ""),
    reason: String(row.reason || ""),
    payload: (row.payload_json as Record<string, unknown>) || {},
    preview: String(row.preview || ""),
    createdAt: String(row.created_at || ""),
    requestedBy: String(row.requested_by || ""),
    requestedStore: String(row.requested_store || ""),
    approvedBy: row.approved_by == null ? null : String(row.approved_by),
    approvedAt: row.approved_at == null ? null : String(row.approved_at),
    executedAt: row.executed_at == null ? null : String(row.executed_at),
    error: row.error_message == null ? null : String(row.error_message),
  }
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const limitRaw = Number(searchParams.get("limit") || 30)
  const limit = Math.max(1, Math.min(limitRaw, 200))
  if (!Number.isFinite(limitRaw)) {
    return NextResponse.json(
      { error: "limit must be a number", code: "AI_VALIDATION_ERROR" },
      { status: 400, headers }
    )
  }
  const status = String(searchParams.get("status") || "").trim()
  const requestedStore = String(searchParams.get("store") || "").trim()
  const policy = buildAiDataPolicy({
    scoped: access.scoped,
    intent: "qa",
    requestedStore: requestedStore || access.scoped.store || "All",
  })
  const filters: string[] = []
  if (status) filters.push(`status=eq.${encodeURIComponent(status)}`)
  if (policy.storeScope !== "all") {
    filters.push(`requested_store=eq.${encodeURIComponent(policy.resolvedStore)}`)
  } else if (requestedStore && requestedStore !== "All") {
    filters.push(`requested_store=eq.${encodeURIComponent(policy.resolvedStore)}`)
  }
  const filterStr = filters.join("&")
  const rows = (await supabaseSelectFilter("ai_action_requests", filterStr, {
    order: "id.desc",
    limit,
    select:
      "id,status,action_type,reason,payload_json,preview,created_at,requested_by,requested_store,approved_by,approved_at,executed_at,error_message",
  })) as Record<string, unknown>[] | null

  return NextResponse.json(
    {
      items: (rows || []).map(toResponseRow),
      meta: {
        requestedStore: policy.requestedStore,
        resolvedStore: policy.resolvedStore,
        isStoreCoerced: policy.isStoreCoerced,
        storeScope: policy.storeScope,
      },
    },
    { headers }
  )
}

