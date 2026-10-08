import { NextRequest, NextResponse } from "next/server"
import { supabaseSelectFilter, supabaseUpdateByFilter } from "@/lib/supabase-server"
import { requireAuth } from "@/lib/verify-auth"
import {
  STORE_ACTION_CATEGORIES,
  STORE_ACTION_PRIORITIES,
  isStoreActionOpenStatus,
  isStoreActionStatus,
  normalizeStoreActionPhotoUrls,
} from "@/lib/store-action-items"
import type { StoreActionItemRow } from "@/lib/store-action-item-map"
import {
  appendStoreActionLog,
  pushStoreActionNotice,
  resolveStoreActionRecipient,
  resolveStoreActionScope,
  storeActionStoreAllowed,
  type StoreActionLogEvent,
} from "@/lib/store-action-server"

/** 매장 개선 과제 수정·상태 전환·재확인(현장 확인 포함) */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveStoreActionScope(authResult.auth)

  try {
    const body = await request.json()
    const rowOrId = String(body.rowOrId ?? body.id ?? "").trim()
    const data = body.dataStr ? JSON.parse(body.dataStr) : body.data || body
    const action = String(body.action || data.action || "").trim()

    if (!rowOrId || !/^\d+$/.test(rowOrId)) {
      return NextResponse.json({ success: false, message: "잘못된 행입니다." }, { status: 400 })
    }

    const rows = (await supabaseSelectFilter("store_action_items", `id=eq.${encodeURIComponent(rowOrId)}`, {
      limit: 1,
    })) as StoreActionItemRow[]
    const prev = rows?.[0]
    if (!prev) {
      return NextResponse.json({ success: false, message: "해당 건을 찾을 수 없습니다." }, { status: 404 })
    }
    if (!storeActionStoreAllowed(scope, String(prev.store_name || ""))) {
      return NextResponse.json({ success: false, message: "권한이 없는 매장입니다." }, { status: 403 })
    }

    const nowIso = new Date().toISOString()
    const actorName = scope.actorName
    const canVerify = scope.canVerify
    const prevStatus = String(prev.status || "open")

    const patch: Record<string, unknown> = { updated_at: nowIso }
    let logEvent: StoreActionLogEvent = "update"
    let logNote = ""

    if (action === "verify_pass") {
      if (!canVerify) {
        return NextResponse.json(
          { success: false, message: "재확인(Verified)은 슈퍼바이저·본사만 가능합니다." },
          { status: 403 }
        )
      }
      if (!isStoreActionOpenStatus(prevStatus)) {
        return NextResponse.json(
          { success: false, message: "진행 중인 과제만 완료 확정할 수 있습니다." },
          { status: 400 }
        )
      }
      const ownerName = String(prev.owner_name || "").trim().toLowerCase()
      if (ownerName && actorName && ownerName === actorName.toLowerCase()) {
        return NextResponse.json(
          { success: false, message: "담당자 본인은 재확인할 수 없습니다." },
          { status: 400 }
        )
      }
      patch.status = "completed"
      patch.verified_at = nowIso
      patch.completed_at = nowIso
      patch.verifier_name = actorName || String(prev.verifier_name || "")
      if (scope.actorEmployeeId) patch.verifier_user_id = String(scope.actorEmployeeId)
      patch.verification_note = String(data.verificationNote ?? data.verification_note ?? "").trim()
      const afterUrls = normalizeStoreActionPhotoUrls(data.afterPhotoUrls ?? data.after_photo_urls)
      if (afterUrls.length) patch.after_photo_urls = afterUrls
      logEvent = "verify_pass"
      logNote = String(patch.verification_note || "")
    } else if (action === "verify_reject") {
      if (!canVerify) {
        return NextResponse.json(
          { success: false, message: "재확인(Verified)은 슈퍼바이저·본사만 가능합니다." },
          { status: 403 }
        )
      }
      if (!isStoreActionOpenStatus(prevStatus)) {
        return NextResponse.json(
          { success: false, message: "진행 중인 과제만 반려할 수 있습니다." },
          { status: 400 }
        )
      }
      patch.status = "in_progress"
      patch.verified_at = null
      patch.completed_at = null
      patch.verification_note = String(data.verificationNote ?? data.verification_note ?? "").trim()
      const afterUrls = normalizeStoreActionPhotoUrls(data.afterPhotoUrls ?? data.after_photo_urls)
      if (afterUrls.length) patch.after_photo_urls = afterUrls
      logEvent = "verify_reject"
      logNote = String(patch.verification_note || "")
    } else if (action === "request_verify") {
      patch.status = "pending_verify"
      patch.resolution_note = String(
        data.resolutionNote ?? data.resolution_note ?? prev.resolution_note ?? ""
      ).trim()
      const afterUrls = normalizeStoreActionPhotoUrls(data.afterPhotoUrls ?? data.after_photo_urls)
      if (afterUrls.length) patch.after_photo_urls = afterUrls
      logEvent = "request_verify"
      logNote = String(patch.resolution_note || "")
    } else {
      if (data.store != null || data.store_name != null) {
        const nextStore = String(data.store ?? data.store_name ?? "").trim()
        if (nextStore && !storeActionStoreAllowed(scope, nextStore)) {
          return NextResponse.json({ success: false, message: "권한이 없는 매장입니다." }, { status: 403 })
        }
        patch.store_name = nextStore
      }
      if (data.title != null) patch.title = String(data.title).trim()
      if (data.description != null) patch.description = String(data.description).trim()
      if (data.category != null) {
        let category = String(data.category).trim() || "기타"
        if (!(STORE_ACTION_CATEGORIES as readonly string[]).includes(category)) category = "기타"
        patch.category = category
      }
      if (data.priority != null) {
        let priority = String(data.priority).trim() || "보통"
        if (!(STORE_ACTION_PRIORITIES as readonly string[]).includes(priority)) priority = "보통"
        patch.priority = priority
      }
      if (data.ownerName != null || data.owner_name != null) {
        patch.owner_name = String(data.ownerName ?? data.owner_name ?? "").trim()
      }
      if (data.ownerUserId != null || data.owner_user_id != null) {
        const v = String(data.ownerUserId ?? data.owner_user_id ?? "").trim()
        patch.owner_user_id = v || null
      }
      if (data.dueDate != null || data.due_date != null) {
        const due = String(data.dueDate ?? data.due_date ?? "").trim().slice(0, 10)
        if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
          return NextResponse.json({ success: false, message: "완료 기한 형식이 올바르지 않습니다." }, { status: 400 })
        }
        patch.due_date = due || null
      }
      if (data.verifierName != null || data.verifier_name != null) {
        patch.verifier_name = String(data.verifierName ?? data.verifier_name ?? "").trim()
      }
      if (data.verifierUserId != null || data.verifier_user_id != null) {
        const v = String(data.verifierUserId ?? data.verifier_user_id ?? "").trim()
        patch.verifier_user_id = v || null
      }
      if (data.actionPlan != null || data.action_plan != null) {
        patch.action_plan = String(data.actionPlan ?? data.action_plan ?? "").trim()
      }
      if (data.resolutionNote != null || data.resolution_note != null) {
        patch.resolution_note = String(data.resolutionNote ?? data.resolution_note ?? "").trim()
      }
      if (data.verificationNote != null || data.verification_note != null) {
        patch.verification_note = String(data.verificationNote ?? data.verification_note ?? "").trim()
      }
      if (data.photoUrls !== undefined || data.photo_urls !== undefined) {
        patch.photo_urls = normalizeStoreActionPhotoUrls(data.photoUrls ?? data.photo_urls)
      }
      if (data.afterPhotoUrls !== undefined || data.after_photo_urls !== undefined) {
        patch.after_photo_urls = normalizeStoreActionPhotoUrls(data.afterPhotoUrls ?? data.after_photo_urls)
      }
      if (data.linkedRepairTicketId !== undefined || data.linked_repair_ticket_id !== undefined) {
        const raw = data.linkedRepairTicketId ?? data.linked_repair_ticket_id
        patch.linked_repair_ticket_id =
          raw != null && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null
      }

      const nextStatus = String(data.status ?? "").trim()
      if (nextStatus) {
        if (!isStoreActionStatus(nextStatus)) {
          return NextResponse.json({ success: false, message: "잘못된 상태입니다." }, { status: 400 })
        }
        if (nextStatus === "completed") {
          if (!canVerify) {
            return NextResponse.json(
              { success: false, message: "완료는 재확인(Verified) 권한이 있는 사용자만 가능합니다." },
              { status: 403 }
            )
          }
          patch.status = "completed"
          patch.verified_at = nowIso
          patch.completed_at = nowIso
          if (!patch.verifier_name) patch.verifier_name = actorName || String(prev.verifier_name || "")
        } else {
          if (prevStatus === "completed" && !canVerify) {
            return NextResponse.json(
              { success: false, message: "완료된 과제를 다시 열 권한이 없습니다." },
              { status: 403 }
            )
          }
          patch.status = nextStatus
          patch.completed_at = null
          if (nextStatus !== "pending_verify") patch.verified_at = null
        }
      }

      const ownerAfter = String(patch.owner_name ?? prev.owner_name ?? "").trim()
      const verifierAfter = String(patch.verifier_name ?? prev.verifier_name ?? "").trim()
      if (ownerAfter && verifierAfter && ownerAfter.toLowerCase() === verifierAfter.toLowerCase()) {
        return NextResponse.json(
          { success: false, message: "담당자와 재확인 담당자는 달라야 합니다." },
          { status: 400 }
        )
      }

      const ownerChanged =
        patch.owner_name != null &&
        String(patch.owner_name).toLowerCase() !== String(prev.owner_name || "").trim().toLowerCase()
      if (ownerChanged) logEvent = "reassign"
      else if (patch.status != null && patch.status !== prevStatus) logEvent = "status"
    }

    await supabaseUpdateByFilter("store_action_items", `id=eq.${encodeURIComponent(rowOrId)}`, patch)

    const nextStatus = String(patch.status ?? prevStatus)
    const changedFields = Object.keys(patch).filter((k) => k !== "updated_at")
    await appendStoreActionLog({
      actionId: Number(rowOrId),
      actor: actorName,
      event: logEvent,
      fromStatus: prevStatus,
      toStatus: nextStatus,
      note: logNote,
      detail: { fields: changedFields },
    })

    const store = String(patch.store_name ?? prev.store_name ?? "")
    const title = String(patch.title ?? prev.title ?? "")
    const ownerRecipient = () =>
      resolveStoreActionRecipient({
        userId: String(patch.owner_user_id ?? prev.owner_user_id ?? ""),
        name: String(patch.owner_name ?? prev.owner_name ?? ""),
        fallbackStore: store,
      })
    if (logEvent === "request_verify") {
      const verifier = await resolveStoreActionRecipient({
        userId: String(prev.verifier_user_id || ""),
        name: String(prev.verifier_name || ""),
        fallbackStore: store,
      })
      await pushStoreActionNotice({
        title: "[개선 과제] 재확인 요청",
        body: `${store} · ${title}\n담당자 ${actorName}님이 조치 완료를 보고했습니다.`,
        recipients: [verifier],
      })
    } else if (logEvent === "verify_reject") {
      await pushStoreActionNotice({
        title: "[개선 과제] 재확인 반려",
        body: `${store} · ${title}${logNote ? `\n사유: ${logNote}` : ""}`,
        recipients: [await ownerRecipient()],
      })
    } else if (logEvent === "verify_pass") {
      await pushStoreActionNotice({
        title: "[개선 과제] 완료 확정",
        body: `${store} · ${title}\n재확인: ${actorName}`,
        recipients: [await ownerRecipient()],
      })
    } else if (logEvent === "reassign") {
      await pushStoreActionNotice({
        title: "[개선 과제] 새 과제가 배정되었습니다",
        body: `${store} · ${title}\n기한: ${String(patch.due_date ?? prev.due_date ?? "-")}`,
        recipients: [await ownerRecipient()],
      })
    }

    return NextResponse.json({ success: true, message: "수정되었습니다.", status: nextStatus })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("updateStoreActionItem:", msg)
    return NextResponse.json({ success: false, message: "수정 실패: " + msg }, { status: 500 })
  }
}
