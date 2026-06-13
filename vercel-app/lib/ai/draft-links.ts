/** AI 초안 → ERP 화면 이어가기 URL (query prefill) */

export function buildNoticeDraftContinueUrl(params: {
  draftId: number
  title: string
  content: string
  targetStore?: string
}): string {
  const sp = new URLSearchParams()
  sp.set("aiNoticeDraftId", String(params.draftId))
  sp.set("prefillTitle", params.title.slice(0, 200))
  sp.set("prefillContent", params.content.slice(0, 2000))
  if (params.targetStore && params.targetStore !== "All") {
    sp.set("prefillStore", params.targetStore)
  }
  return `/admin/notices?${sp.toString()}`
}

export function buildFollowupTaskContinueUrl(params: {
  draftId: number
  title: string
  description?: string
  dueDate?: string | null
}): string {
  const sp = new URLSearchParams()
  sp.set("aiTaskDraftId", String(params.draftId))
  sp.set("aiTaskTitle", params.title.slice(0, 200))
  if (params.description) sp.set("aiTaskDesc", params.description.slice(0, 2000))
  if (params.dueDate) sp.set("aiTaskDue", params.dueDate.slice(0, 10))
  return `/admin/work-log?${sp.toString()}`
}

export function buildAiFollowupTaskManageUrl(taskId: number): string {
  return `/admin/work-log?aiFollowupTaskId=${taskId}`
}
