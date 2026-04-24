import { getBangkokDateTimeString } from "@/lib/bangkok-time"
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from "@/lib/supabase-server"
import type { AiActionType, AiScopedAuth } from "@/lib/ai/types"
import { isOfficeRole } from "@/lib/permissions"
import { AiRouteError } from "@/lib/ai/errors"

type CatalogInput = {
  actionType: AiActionType
  payload: Record<string, unknown>
  reason: string
}

type CatalogResult = {
  preview: string
}

function normalizeStoreScope(value: unknown, fallback: string): string {
  const v = String(value || "").trim()
  if (v) return v.slice(0, 120)
  return String(fallback || "All").trim().slice(0, 120) || "All"
}

/**
 * 액션 payload의 매장 스코프를 서버에서 강제한다.
 * - 본사 권한: 요청 payload를 신뢰(값만 정규화)
 * - 비본사 권한: 자신의 매장만 허용 (All/타매장 금지)
 */
export function sanitizeAiActionPayloadScope(input: {
  actionType: AiActionType
  payload: Record<string, unknown>
  scoped: Pick<AiScopedAuth, "role" | "store">
}): Record<string, unknown> {
  const payload = { ...input.payload }
  const userStore = String(input.scoped.store || "").trim()
  const office = isOfficeRole(input.scoped.role)
  if (!office && !userStore) {
    throw new AiRouteError(
      "AI_SCOPE_VIOLATION",
      "사용자 매장 스코프가 없어 AI 액션을 생성할 수 없습니다.",
      403
    )
  }

  const enforceStore = (key: "targetStore" | "storeScope") => {
    const requested = normalizeStoreScope(payload[key], office ? "All" : userStore)
    if (!office && requested !== userStore) {
      throw new AiRouteError(
        "AI_SCOPE_VIOLATION",
        `해당 액션의 ${key}는 본인 매장(${userStore})만 허용됩니다.`,
        403
      )
    }
    payload[key] = office ? requested : userStore
  }

  switch (input.actionType) {
    case "create_notice_draft":
    case "create_weather_campaign_draft":
      enforceStore("targetStore")
      break
    case "create_followup_task":
    case "create_shift_adjustment_draft":
    case "save_accounting_workflow_status":
      enforceStore("storeScope")
      break
    default:
      break
  }

  return payload
}

export function validateAiActionInput(input: CatalogInput): CatalogResult {
  const reason = String(input.reason || "").trim()
  if (!reason) throw new Error("reason is required")
  if (reason.length > 1000) throw new Error("reason is too long")

  switch (input.actionType) {
    case "create_notice_draft": {
      const title = String(input.payload.title || "").trim()
      const content = String(input.payload.content || "").trim()
      if (!title || !content) throw new Error("title/content are required")
      return { preview: `공지 초안 생성: ${title.slice(0, 80)}` }
    }
    case "create_followup_task": {
      const taskTitle = String(input.payload.taskTitle || "").trim()
      if (!taskTitle) throw new Error("taskTitle is required")
      return { preview: `후속 태스크 생성: ${taskTitle.slice(0, 80)}` }
    }
    case "update_followup_task_status": {
      const taskId = Number(input.payload.taskId || 0)
      const status = String(input.payload.status || "").trim()
      if (!taskId || !["todo", "in_progress", "done", "cancelled"].includes(status)) {
        throw new Error("taskId/status are invalid")
      }
      return { preview: `후속 태스크 상태 변경: #${taskId} -> ${status}` }
    }
    case "save_accounting_workflow_status": {
      const yearMonth = String(input.payload.yearMonth || "").trim()
      const filingType = String(input.payload.filingType || "").trim()
      const status = String(input.payload.status || "").trim()
      if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error("yearMonth must be YYYY-MM")
      if (!filingType) throw new Error("filingType is required")
      if (!["todo", "in_progress", "review", "done"].includes(status)) {
        throw new Error("status is invalid")
      }
      return { preview: `회계 워크플로우 상태 변경: ${yearMonth} ${filingType} -> ${status}` }
    }
    case "create_weather_campaign_draft": {
      const title = String(input.payload.title || "").trim()
      const content = String(input.payload.content || "").trim()
      if (!title || !content) throw new Error("title/content are required")
      return { preview: `날씨 연계 마케팅 초안: ${title.slice(0, 80)}` }
    }
    case "create_shift_adjustment_draft": {
      const taskTitle = String(input.payload.taskTitle || "").trim()
      if (!taskTitle) throw new Error("taskTitle is required")
      return { preview: `날씨 연계 인력조정 초안: ${taskTitle.slice(0, 80)}` }
    }
    default:
      throw new Error("unsupported actionType")
  }
}

export async function executeAiAction(input: {
  requestId: number
  actionType: AiActionType
  payload: Record<string, unknown>
  scoped: AiScopedAuth
}) {
  const now = getBangkokDateTimeString()

  if (input.actionType === "create_notice_draft") {
    const row = {
      title: String(input.payload.title || "").trim().slice(0, 200),
      content: String(input.payload.content || "").trim().slice(0, 20000),
      target_store: String(input.payload.targetStore || input.scoped.store || "All").trim().slice(0, 120),
      created_by: input.scoped.name.slice(0, 120),
      created_at: now,
      source: "ai_center",
    }
    const inserted = (await supabaseInsert("ai_notice_drafts", row)) as { id?: number }[] | null
    return { resultType: "notice_draft", resultId: Number(inserted?.[0]?.id || 0) }
  }

  if (input.actionType === "create_followup_task") {
    const row = {
      title: String(input.payload.taskTitle || "").trim().slice(0, 200),
      description: String(input.payload.description || "").trim().slice(0, 4000),
      owner: String(input.payload.owner || "").trim().slice(0, 120),
      store_scope: String(input.payload.storeScope || input.scoped.store || "All").trim().slice(0, 120),
      due_date: String(input.payload.dueDate || "").trim().slice(0, 10) || null,
      status: "todo",
      created_by: input.scoped.name.slice(0, 120),
      created_at: now,
      source: "ai_center",
    }
    const inserted = (await supabaseInsert("ai_followup_tasks", row)) as { id?: number }[] | null
    return { resultType: "followup_task", resultId: Number(inserted?.[0]?.id || 0) }
  }

  if (input.actionType === "update_followup_task_status") {
    const taskId = Number(input.payload.taskId || 0)
    const status = String(input.payload.status || "").trim()
    await supabaseUpdateByFilter(
      "ai_followup_tasks",
      `id=eq.${taskId}`,
      { status, updated_by: input.scoped.name.slice(0, 120), updated_at: now }
    )
    return { resultType: "followup_task", resultId: taskId }
  }

  if (input.actionType === "save_accounting_workflow_status") {
    const yearMonth = String(input.payload.yearMonth || "").trim().slice(0, 7)
    const filingType = String(input.payload.filingType || "").trim().slice(0, 80)
    const storeScope = String(input.payload.storeScope || "All").trim().slice(0, 120)
    const status = String(input.payload.status || "").trim().toLowerCase()
    const note = input.payload.note == null ? null : String(input.payload.note).slice(0, 2000)
    const owner = input.payload.owner == null ? null : String(input.payload.owner).slice(0, 120)

    const exists = (await supabaseSelectFilter(
      "accounting_filing_workflow_status",
      `year_month=eq.${encodeURIComponent(yearMonth)}&filing_type=eq.${encodeURIComponent(filingType)}&store_scope=eq.${encodeURIComponent(storeScope)}`,
      { select: "id", limit: 1 }
    )) as { id?: number }[] | null

    if (exists?.[0]?.id) {
      await supabaseUpdateByFilter(
        "accounting_filing_workflow_status",
        `id=eq.${exists[0].id}`,
        {
          status,
          note,
          owner,
          updated_by: input.scoped.name.slice(0, 120),
          updated_at: now,
        }
      )
      return { resultType: "accounting_workflow", resultId: Number(exists[0].id) }
    }

    const inserted = (await supabaseInsert("accounting_filing_workflow_status", {
      year_month: yearMonth,
      filing_type: filingType,
      store_scope: storeScope,
      status,
      note,
      owner,
      updated_by: input.scoped.name.slice(0, 120),
      updated_at: now,
    })) as { id?: number }[] | null
    return { resultType: "accounting_workflow", resultId: Number(inserted?.[0]?.id || 0) }
  }

  if (input.actionType === "create_weather_campaign_draft") {
    const row = {
      title: String(input.payload.title || "").trim().slice(0, 200),
      content: String(input.payload.content || "").trim().slice(0, 20000),
      target_store: String(input.payload.targetStore || input.scoped.store || "All").trim().slice(0, 120),
      created_by: input.scoped.name.slice(0, 120),
      created_at: now,
      source: "ai_weather_campaign",
    }
    const inserted = (await supabaseInsert("ai_notice_drafts", row)) as { id?: number }[] | null
    return { resultType: "weather_campaign_draft", resultId: Number(inserted?.[0]?.id || 0) }
  }

  if (input.actionType === "create_shift_adjustment_draft") {
    const row = {
      title: String(input.payload.taskTitle || "").trim().slice(0, 200),
      description: String(input.payload.description || "").trim().slice(0, 4000),
      owner: String(input.payload.owner || "").trim().slice(0, 120),
      store_scope: String(input.payload.storeScope || input.scoped.store || "All").trim().slice(0, 120),
      due_date: String(input.payload.dueDate || "").trim().slice(0, 10) || null,
      status: "todo",
      created_by: input.scoped.name.slice(0, 120),
      created_at: now,
      source: "ai_shift_adjustment",
    }
    const inserted = (await supabaseInsert("ai_followup_tasks", row)) as { id?: number }[] | null
    return { resultType: "shift_adjustment_draft", resultId: Number(inserted?.[0]?.id || 0) }
  }

  throw new Error("unsupported actionType")
}

