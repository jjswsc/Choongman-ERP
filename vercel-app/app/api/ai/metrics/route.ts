import { NextRequest, NextResponse } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import { getBangkokTodayDateString, addBangkokCalendarDays } from "@/lib/bangkok-time"
import { supabaseCountFilter, supabaseSelectFilter } from "@/lib/supabase-server"
import { buildAiDataPolicy } from "@/lib/ai/policy"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const requestedStore = String(searchParams.get("store") || access.scoped.store || "All").trim()
  const today = getBangkokTodayDateString()
  const start7d = addBangkokCalendarDays(today, -6)
  const policy = buildAiDataPolicy({
    scoped: access.scoped,
    intent: "reporting",
    requestedStore,
  })
  const storeFilter = (() => {
    if (policy.storeScope !== "all") {
      return `&requested_store=eq.${encodeURIComponent(policy.resolvedStore)}`
    }
    if (requestedStore && requestedStore !== "All") {
      return `&requested_store=eq.${encodeURIComponent(policy.resolvedStore)}`
    }
    return ""
  })()

  const pendingApprovals = await supabaseCountFilter(
    "ai_action_requests",
    `status=eq.pending_approval${storeFilter}`
  ).catch(() => 0)

  const executedToday = await supabaseCountFilter(
    "ai_action_requests",
    `status=eq.executed&executed_at=gte.${encodeURIComponent(`${today} 00:00:00`)}&executed_at=lte.${encodeURIComponent(`${today} 23:59:59`)}${storeFilter}`
  ).catch(() => 0)

  const failedToday = await supabaseCountFilter(
    "ai_action_requests",
    `status=eq.failed&updated_at=gte.${encodeURIComponent(`${today} 00:00:00`)}&updated_at=lte.${encodeURIComponent(`${today} 23:59:59`)}${storeFilter}`
  ).catch(() => 0)

  const rows = (await supabaseSelectFilter(
    "ai_action_requests",
    `updated_at=gte.${encodeURIComponent(`${start7d} 00:00:00`)}${storeFilter}`,
    { order: "id.desc", limit: 1000, select: "status,updated_at" }
  ).catch(() => [])) as { status?: string; updated_at?: string }[]

  const recent = rows.filter((r) => {
    const dt = String(r.updated_at || "")
    return dt >= `${start7d} 00:00:00` && dt <= `${today} 23:59:59`
  })
  const successes = recent.filter((r) => String(r.status || "") === "executed").length
  const failures = recent.filter((r) => String(r.status || "") === "failed").length
  const total = successes + failures
  const successRate7d = total > 0 ? Number(((successes / total) * 100).toFixed(1)) : 100

  const usageStoreFilter = (() => {
    if (policy.storeScope !== "all") {
      return `&user_store=eq.${encodeURIComponent(policy.resolvedStore)}`
    }
    if (requestedStore && requestedStore !== "All") {
      return `&user_store=eq.${encodeURIComponent(policy.resolvedStore)}`
    }
    return ""
  })()
  const usageRows = (await supabaseSelectFilter(
    "ai_usage_logs",
    `created_at=gte.${encodeURIComponent(`${today} 00:00:00`)}&created_at=lte.${encodeURIComponent(`${today} 23:59:59`)}${usageStoreFilter}`,
    { limit: 2000, select: "prompt_tokens,completion_tokens,total_tokens" }
  ).catch(() => [])) as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }[]
  const promptTokensToday = usageRows.reduce((s, r) => s + Number(r.prompt_tokens || 0), 0)
  const completionTokensToday = usageRows.reduce((s, r) => s + Number(r.completion_tokens || 0), 0)
  const totalTokensToday = usageRows.reduce((s, r) => s + Number(r.total_tokens || 0), 0)

  return NextResponse.json(
    {
      pendingApprovals,
      executedToday,
      failedToday,
      successRate7d,
      promptTokensToday,
      completionTokensToday,
      totalTokensToday,
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

