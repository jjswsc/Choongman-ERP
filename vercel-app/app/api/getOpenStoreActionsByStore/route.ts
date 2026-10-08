import { NextRequest, NextResponse } from "next/server"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { requireAuth } from "@/lib/verify-auth"
import { mapStoreActionItemRow, type StoreActionItemRow } from "@/lib/store-action-item-map"
import { STORE_ACTION_OPEN_STATUSES } from "@/lib/store-action-items"

/** 방문 체크인용 — 특정 매장의 미완료 개선 과제 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) return authResult.errorResponse

  const store = String(new URL(request.url).searchParams.get("store") || "").trim()
  if (!store) {
    return NextResponse.json({ success: false, message: "매장이 필요합니다.", items: [] }, { status: 400 })
  }

  const today = getBangkokTodayDateString()
  const filterStr = [
    `store_name=eq.${encodeURIComponent(store)}`,
    `status=in.(${STORE_ACTION_OPEN_STATUSES.join(",")})`,
  ].join("&")

  try {
    const list = (await supabaseSelectFilter("store_action_items", filterStr, {
      order: "due_date.asc.nullslast,created_at.desc,id.desc",
      limit: 200,
    })) as StoreActionItemRow[]

    const items = (list || []).map((d) => mapStoreActionItemRow(d, today))
    items.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
      return (b.createdAt || "").localeCompare(a.createdAt || "")
    })

    return NextResponse.json({
      success: true,
      store,
      today,
      overdueCount: items.filter((x) => x.overdue).length,
      pendingVerifyCount: items.filter((x) => x.status === "pending_verify").length,
      items,
    })
  } catch (e) {
    console.error("getOpenStoreActionsByStore:", e)
    return NextResponse.json({ success: false, message: "조회 실패", items: [] }, { status: 500 })
  }
}
