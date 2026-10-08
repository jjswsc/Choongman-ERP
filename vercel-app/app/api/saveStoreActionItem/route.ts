import { NextRequest, NextResponse } from "next/server"
import { supabaseInsert, supabaseSelectFilter } from "@/lib/supabase-server"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { requireAuth } from "@/lib/verify-auth"
import {
  STORE_ACTION_CATEGORIES,
  STORE_ACTION_PRIORITIES,
  STORE_ACTION_SOURCE_TYPES,
  normalizeStoreActionPhotoUrls,
  normalizeTitleKey,
} from "@/lib/store-action-items"

async function computeRepeatCount(store: string, category: string, title: string): Promise<number> {
  const titleKey = normalizeTitleKey(title)
  if (!store || !titleKey) return 0
  try {
    const rows = (await supabaseSelectFilter(
      "store_action_items",
      [
        `store_name=eq.${encodeURIComponent(store)}`,
        `category=eq.${encodeURIComponent(category || "기타")}`,
      ].join("&"),
      {
        select: "title,status,repeat_count",
        limit: 200,
        order: "id.desc",
      }
    )) as { title?: string; status?: string; repeat_count?: number }[]

    let maxRepeat = 0
    let similar = 0
    for (const r of rows || []) {
      if (normalizeTitleKey(String(r.title || "")) !== titleKey) continue
      similar += 1
      const rc = Number(r.repeat_count || 0) || 0
      if (rc > maxRepeat) maxRepeat = rc
    }
    if (similar === 0) return 0
    return Math.max(maxRepeat + 1, similar)
  } catch {
    return 0
  }
}

/** 매장 개선 과제 신규 등록 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const auth = authResult.auth

  try {
    const body = await request.json()
    const data = body.dataStr ? JSON.parse(body.dataStr) : body.data || body

    const store = String(data.store || data.store_name || "").trim()
    const title = String(data.title || "").trim()
    const ownerName = String(data.ownerName || data.owner_name || "").trim()
    const dueDate = String(data.dueDate || data.due_date || "").trim().slice(0, 10)
    const verifierName = String(data.verifierName || data.verifier_name || "").trim()

    if (!store) {
      return NextResponse.json({ success: false, message: "매장을 선택하세요." }, { status: 400 })
    }
    if (!title) {
      return NextResponse.json({ success: false, message: "제목을 입력하세요." }, { status: 400 })
    }
    if (!ownerName) {
      return NextResponse.json({ success: false, message: "담당자(Owner)를 입력하세요." }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return NextResponse.json({ success: false, message: "완료 기한(Due Date)을 선택하세요." }, { status: 400 })
    }
    if (!verifierName) {
      return NextResponse.json(
        { success: false, message: "재확인 담당자(Verifier)를 입력하세요." },
        { status: 400 }
      )
    }
    if (ownerName.toLowerCase() === verifierName.toLowerCase()) {
      return NextResponse.json(
        { success: false, message: "담당자와 재확인 담당자는 달라야 합니다." },
        { status: 400 }
      )
    }

    let category = String(data.category || "기타").trim() || "기타"
    if (!(STORE_ACTION_CATEGORIES as readonly string[]).includes(category)) category = "기타"

    let priority = String(data.priority || "보통").trim() || "보통"
    if (!(STORE_ACTION_PRIORITIES as readonly string[]).includes(priority)) priority = "보통"

    let sourceType = String(data.sourceType || data.source_type || "manual").trim() || "manual"
    if (!(STORE_ACTION_SOURCE_TYPES as readonly string[]).includes(sourceType)) sourceType = "manual"

    const photoUrls = normalizeStoreActionPhotoUrls(data.photoUrls ?? data.photo_urls)
    const afterPhotoUrls = normalizeStoreActionPhotoUrls(data.afterPhotoUrls ?? data.after_photo_urls)
    const repeatCount = await computeRepeatCount(store, category, title)
    const nowIso = new Date().toISOString()
    const createdBy = String(data.createdBy || data.created_by || auth.name || "").trim()

    const insertRow: Record<string, unknown> = {
      store_name: store,
      title,
      description: String(data.description || "").trim(),
      category,
      priority,
      status: "open",
      owner_name: ownerName,
      owner_user_id: String(data.ownerUserId || data.owner_user_id || "").trim() || null,
      due_date: dueDate,
      verifier_name: verifierName,
      verifier_user_id: String(data.verifierUserId || data.verifier_user_id || "").trim() || null,
      action_plan: String(data.actionPlan || data.action_plan || "").trim(),
      resolution_note: String(data.resolutionNote || data.resolution_note || "").trim(),
      photo_urls: photoUrls,
      after_photo_urls: afterPhotoUrls,
      source_type: sourceType,
      source_ref: String(data.sourceRef || data.source_ref || "").trim(),
      linked_repair_ticket_id:
        data.linkedRepairTicketId != null && data.linkedRepairTicketId !== ""
          ? Number(data.linkedRepairTicketId)
          : data.linked_repair_ticket_id != null && data.linked_repair_ticket_id !== ""
            ? Number(data.linked_repair_ticket_id)
            : null,
      repeat_count: repeatCount,
      created_by: createdBy,
      created_at: nowIso,
      updated_at: nowIso,
    }

    await supabaseInsert("store_action_items", insertRow)

    return NextResponse.json({
      success: true,
      message: "저장되었습니다.",
      repeatCount,
      today: getBangkokTodayDateString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("saveStoreActionItem:", msg)
    return NextResponse.json({ success: false, message: "저장 실패: " + msg }, { status: 500 })
  }
}
