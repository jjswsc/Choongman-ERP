import { NextRequest, NextResponse } from "next/server"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import { requireAuth } from "@/lib/verify-auth"
import { resolveStoreActionScope, storeActionStoreAllowed } from "@/lib/store-action-server"

/** 개선 과제 변경 이력(타임라인) */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveStoreActionScope(authResult.auth)

  const id = String(new URL(request.url).searchParams.get("id") || "").trim()
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, message: "잘못된 과제입니다.", list: [] }, { status: 400 })
  }

  try {
    const items = (await supabaseSelectFilter("store_action_items", `id=eq.${id}`, {
      select: "id,store_name",
      limit: 1,
    })) as { id?: number; store_name?: string }[]
    const item = items?.[0]
    if (!item) return NextResponse.json({ success: true, list: [] })
    if (!storeActionStoreAllowed(scope, String(item.store_name || ""))) {
      return NextResponse.json({ success: false, message: "권한이 없는 매장입니다.", list: [] }, { status: 403 })
    }

    let rows: {
      id?: number
      actor?: string
      event?: string
      from_status?: string
      to_status?: string
      note?: string
      created_at?: string
    }[] = []
    try {
      rows = ((await supabaseSelectFilter("store_action_logs", `action_id=eq.${id}`, {
        select: "id,actor,event,from_status,to_status,note,created_at",
        order: "created_at.asc,id.asc",
        limit: 500,
      })) || []) as typeof rows
    } catch {
      rows = []
    }

    return NextResponse.json({
      success: true,
      list: rows.map((r) => ({
        id: Number(r.id || 0),
        actor: String(r.actor || ""),
        event: String(r.event || ""),
        fromStatus: String(r.from_status || ""),
        toStatus: String(r.to_status || ""),
        note: String(r.note || ""),
        createdAt: String(r.created_at || ""),
      })),
    })
  } catch (e) {
    console.error("getStoreActionLogs:", e)
    return NextResponse.json({ success: false, message: "조회 실패", list: [] }, { status: 500 })
  }
}
