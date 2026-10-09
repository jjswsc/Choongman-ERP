import { NextRequest, NextResponse } from "next/server"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { requireAuth } from "@/lib/verify-auth"
import {
  STORE_ACTION_CATEGORIES,
  STORE_ACTION_PRIORITIES,
  STORE_ACTION_SOURCE_TYPES,
  normalizeStoreActionPhotoUrls,
} from "@/lib/store-action-items"
import {
  appendStoreActionLog,
  computeStoreActionRecurrence,
  insertStoreActionItemRow,
  pushStoreActionNotice,
  resolveStoreActionRecipient,
  resolveStoreActionScope,
  storeActionStoreAllowed,
} from "@/lib/store-action-server"
import { syncDailyPlanOnStoreActionCreated } from "@/lib/daily-plan-hooks"

/** 매장 개선 과제 신규 등록 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const auth = authResult.auth
  const scope = resolveStoreActionScope(auth)

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
    if (!storeActionStoreAllowed(scope, store)) {
      return NextResponse.json({ success: false, message: "권한이 없는 매장입니다." }, { status: 403 })
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

    const checkItemId = String(data.checkItemId || data.check_item_id || "").trim().slice(0, 200)
    const photoUrls = normalizeStoreActionPhotoUrls(data.photoUrls ?? data.photo_urls)
    const afterPhotoUrls = normalizeStoreActionPhotoUrls(data.afterPhotoUrls ?? data.after_photo_urls)
    const { repeatCount, parentId } = await computeStoreActionRecurrence({
      store,
      category,
      title,
      checkItemId,
    })
    const nowIso = new Date().toISOString()
    const createdBy = String(data.createdBy || data.created_by || auth.name || "").trim()
    const ownerUserId = String(data.ownerUserId || data.owner_user_id || "").trim()
    const verifierUserId = String(data.verifierUserId || data.verifier_user_id || "").trim()

    const insertRow: Record<string, unknown> = {
      store_name: store,
      title,
      description: String(data.description || "").trim(),
      category,
      priority,
      status: "open",
      owner_name: ownerName,
      owner_user_id: ownerUserId || null,
      due_date: dueDate,
      verifier_name: verifierName,
      verifier_user_id: verifierUserId || null,
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
      check_item_id: checkItemId,
      parent_action_id: parentId,
      created_by: createdBy,
      created_at: nowIso,
      updated_at: nowIso,
    }

    const newId = await insertStoreActionItemRow(insertRow)

    if (newId) {
      await appendStoreActionLog({
        actionId: newId,
        actor: scope.actorName || createdBy,
        event: "create",
        toStatus: "open",
        note: title,
        detail: { ownerName, verifierName, dueDate, repeatCount, parentId, sourceType },
      })
    }

    const owner = await resolveStoreActionRecipient({
      userId: ownerUserId,
      name: ownerName,
      fallbackStore: store,
    })
    const repeatHint = repeatCount > 0 ? ` (재발 ${repeatCount}회 · เกิดซ้ำ ${repeatCount} ครั้ง)` : ""
    await pushStoreActionNotice({
      title: "[개선 과제] 새 과제 배정 · มีงานปรับปรุงใหม่ครับ",
      body: `${store} · ${title}${repeatHint}\n기한 · กำหนดเสร็จ: ${dueDate}\n재확인 · ผู้ตรวจยืนยัน: ${verifierName}`,
      recipients: owner && owner.name.toLowerCase() !== scope.actorName.toLowerCase() ? [owner] : [],
    })

    if (newId) {
      await syncDailyPlanOnStoreActionCreated({
        action: { id: newId, store, title, dueDate },
        ownerName,
        ownerUserId,
        actorName: scope.actorName || createdBy,
        actorEmployeeId: scope.actorEmployeeId,
      })
    }

    return NextResponse.json({
      success: true,
      message: "저장되었습니다.",
      id: newId,
      repeatCount,
      parentId,
      today: getBangkokTodayDateString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("saveStoreActionItem:", msg)
    return NextResponse.json({ success: false, message: "저장 실패: " + msg }, { status: 500 })
  }
}
