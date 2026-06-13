import {
  buildFollowupTaskContinueUrl,
  buildNoticeDraftContinueUrl,
} from "@/lib/ai/draft-links"

export function buildContinueUrlFromAction(input: {
  actionType: string
  executionResultType?: string | null
  executionResultId?: number | null
  payload: Record<string, unknown>
}): string | null {
  const actionType = String(input.actionType || "")
  const resultType = String(input.executionResultType || "")
  const resultId = Number(input.executionResultId || 0)
  const payload = input.payload || {}

  if (
    resultType === "notice_draft" ||
    actionType === "create_notice_draft" ||
    actionType === "create_weather_campaign_draft"
  ) {
    if (!resultId) return null
    return buildNoticeDraftContinueUrl({
      draftId: resultId,
      title: String(payload.title || ""),
      content: String(payload.content || payload.body || ""),
      targetStore: String(payload.targetStore || payload.target_store || "All"),
    })
  }

  if (
    resultType === "followup_task" ||
    actionType === "create_followup_task" ||
    actionType === "create_shift_adjustment_draft"
  ) {
    if (!resultId) return null
    return buildFollowupTaskContinueUrl({
      draftId: resultId,
      title: String(payload.title || ""),
      description: String(payload.description || payload.details || ""),
      dueDate: payload.dueDate == null ? null : String(payload.dueDate),
    })
  }

  return null
}

export function toAiActionResponseRow(row: Record<string, unknown>) {
  const actionType = String(row.action_type || "")
  const payload = (row.payload_json as Record<string, unknown>) || {}
  const executionResultType = row.execution_result_type == null ? null : String(row.execution_result_type)
  const executionResultId = row.execution_result_id == null ? null : Number(row.execution_result_id)
  const status = String(row.status || "pending_approval")

  const continueUrl =
    status === "executed"
      ? buildContinueUrlFromAction({ actionType, executionResultType, executionResultId, payload })
      : null

  return {
    id: Number(row.id || 0),
    status,
    actionType,
    reason: String(row.reason || ""),
    payload,
    preview: String(row.preview || ""),
    createdAt: String(row.created_at || ""),
    requestedBy: String(row.requested_by || ""),
    requestedStore: String(row.requested_store || ""),
    approvedBy: row.approved_by == null ? null : String(row.approved_by),
    approvedAt: row.approved_at == null ? null : String(row.approved_at),
    executedAt: row.executed_at == null ? null : String(row.executed_at),
    error: row.error_message == null ? null : String(row.error_message),
    executionResultType,
    executionResultId,
    continueUrl,
  }
}
