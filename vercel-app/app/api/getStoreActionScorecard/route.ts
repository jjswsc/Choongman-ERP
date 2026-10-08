import { NextRequest, NextResponse } from "next/server"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import { getBangkokMonthRange, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { requireAuth } from "@/lib/verify-auth"
import { buildStoreActionScorecard } from "@/lib/store-action-scorecard"
import { mapStoreActionItemRow, type StoreActionItemRow } from "@/lib/store-action-item-map"
import { resolveStoreActionScope, storeActionScopeFilter } from "@/lib/store-action-server"

/** 개선 과제 월간 성과표 — 매장·담당자·재확인자별 기한 내 완료율 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveStoreActionScope(authResult.auth)

  const monthRaw = String(new URL(request.url).searchParams.get("month") || "").trim()
  const today = getBangkokTodayDateString()
  const month = /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : today.slice(0, 7)
  const { startStr, endStr } = getBangkokMonthRange(month)

  const filters = [
    `due_date=gte.${encodeURIComponent(startStr)}`,
    `due_date=lte.${encodeURIComponent(endStr)}`,
  ]
  const scopeFilter = storeActionScopeFilter(scope)
  if (scopeFilter) filters.push(scopeFilter)

  try {
    const rows = ((await supabaseSelectFilter("store_action_items", filters.join("&"), {
      select: "id,store_name,owner_name,verifier_name,status,due_date,created_at,completed_at,repeat_count",
      order: "due_date.asc,id.asc",
      limit: 5000,
    })) || []) as StoreActionItemRow[]

    const items = rows.map((r) => mapStoreActionItemRow(r, today))
    const card = buildStoreActionScorecard(
      items.map((d) => ({
        store: d.store,
        ownerName: d.ownerName,
        verifierName: d.verifierName,
        status: String(d.status),
        dueDate: d.dueDate,
        createdAt: d.createdAt,
        completedAt: d.completedAt,
        repeatCount: d.repeatCount,
      })),
      today
    )
    return NextResponse.json({ success: true, month, startStr, endStr, today, ...card })
  } catch (e) {
    console.error("getStoreActionScorecard:", e)
    return NextResponse.json({ success: false, message: "조회 실패" }, { status: 500 })
  }
}
