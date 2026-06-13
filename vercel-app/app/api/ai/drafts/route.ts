import { NextRequest, NextResponse } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import { buildAiDataPolicy } from "@/lib/ai/policy"
import { isOfficeRole } from "@/lib/permissions"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import { buildFollowupTaskContinueUrl, buildNoticeDraftContinueUrl } from "@/lib/ai/draft-links"

function toNoticeRow(row: Record<string, unknown>) {
  const id = Number(row.id || 0)
  const title = String(row.title || "")
  const content = String(row.content || "")
  const targetStore = String(row.target_store || "All")
  return {
    id,
    title,
    content: content.slice(0, 500),
    targetStore,
    source: String(row.source || ""),
    createdBy: String(row.created_by || ""),
    createdAt: String(row.created_at || ""),
    continueUrl: buildNoticeDraftContinueUrl({ draftId: id, title, content, targetStore }),
  }
}

function toTaskRow(row: Record<string, unknown>) {
  const id = Number(row.id || 0)
  const title = String(row.title || "")
  const description = String(row.description || "")
  return {
    id,
    title,
    description: description.slice(0, 500),
    owner: row.owner == null ? null : String(row.owner),
    storeScope: String(row.store_scope || "All"),
    dueDate: row.due_date == null ? null : String(row.due_date),
    status: String(row.status || "todo"),
    source: String(row.source || ""),
    createdBy: String(row.created_by || ""),
    createdAt: String(row.created_at || ""),
    continueUrl: buildFollowupTaskContinueUrl({
      draftId: id,
      title,
      description,
      dueDate: row.due_date == null ? null : String(row.due_date),
    }),
  }
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  const sp = req.nextUrl.searchParams
  const limit = Math.max(1, Math.min(Number(sp.get("limit") || 30), 100))
  const requestedStore = String(sp.get("store") || access.scoped.store || "All").trim()
  const policy = buildAiDataPolicy({
    scoped: access.scoped,
    intent: "qa",
    requestedStore,
  })
  const store = policy.resolvedStore

  const noticeFilters = ["order=created_at.desc", `limit=${limit}`]
  const taskFilters = ["order=created_at.desc", `limit=${limit}`]
  if (store !== "All") {
    noticeFilters.unshift(`target_store=eq.${encodeURIComponent(store)}`)
    taskFilters.unshift(`store_scope=eq.${encodeURIComponent(store)}`)
  } else if (!isOfficeRole(access.scoped.role)) {
    noticeFilters.unshift(`target_store=eq.${encodeURIComponent(access.scoped.store || "All")}`)
    taskFilters.unshift(`store_scope=eq.${encodeURIComponent(access.scoped.store || "All")}`)
  }

  const [notices, tasks] = await Promise.all([
    supabaseSelectFilter("ai_notice_drafts", noticeFilters.join("&"), {
      select: "id,title,content,target_store,source,created_by,created_at",
    }).catch(() => []),
    supabaseSelectFilter("ai_followup_tasks", taskFilters.join("&"), {
      select: "id,title,description,owner,store_scope,due_date,status,source,created_by,created_at",
    }).catch(() => []),
  ])

  return NextResponse.json(
    {
      noticeDrafts: ((notices as Record<string, unknown>[]) || []).map(toNoticeRow),
      followupTasks: ((tasks as Record<string, unknown>[]) || []).map(toTaskRow),
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
