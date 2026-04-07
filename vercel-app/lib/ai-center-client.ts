import { apiFetchWithOffline } from "@/lib/api-client"

export type AiIntent = "qa" | "reporting" | "ops_recommend"

export interface AiAskRequest {
  query: string
  intent: AiIntent
  store?: string
  dateRange?: { start?: string; end?: string }
}

export interface AiCitation {
  id: string
  source: string
  title: string
  snippet: string
  updatedAt?: string | null
}

export interface AiAskResponse {
  answer: string
  plan?: string[]
  citations: AiCitation[]
  externalSummary?: string
  externalSignals?: {
    date: string
    store: string
    weatherText: string
    rainProb: number | null
    tempMinC: number | null
    tempMaxC: number | null
    isHoliday: boolean
    holidayName: string | null
    eventTags: string[]
  }[]
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number } | null
  model?: string | null
}

export async function askAiCenter(payload: AiAskRequest): Promise<AiAskResponse> {
  const res = await apiFetchWithOffline("/api/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || "AI 질의 실패")
  return JSON.parse(text) as AiAskResponse
}

export type AiActionType =
  | "create_notice_draft"
  | "create_followup_task"
  | "update_followup_task_status"
  | "save_accounting_workflow_status"
  | "create_weather_campaign_draft"
  | "create_shift_adjustment_draft"

export interface AiActionProposalInput {
  actionType: AiActionType
  reason: string
  payload: Record<string, unknown>
}

export interface AiActionRequestRow {
  id: number
  status: "pending_approval" | "approved" | "rejected" | "executed" | "failed"
  actionType: AiActionType
  reason: string
  payload: Record<string, unknown>
  preview: string
  createdAt: string
  requestedBy: string
  requestedStore: string
  approvedBy?: string | null
  approvedAt?: string | null
  executedAt?: string | null
  error?: string | null
}

export async function proposeAiAction(payload: AiActionProposalInput): Promise<{ request: AiActionRequestRow }> {
  const res = await apiFetchWithOffline("/api/ai/actions/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || "AI 실행 제안 실패")
  return JSON.parse(text) as { request: AiActionRequestRow }
}

export async function approveAiAction(input: {
  requestId: number
  approve: boolean
  comment?: string
}): Promise<{ ok: true; request: AiActionRequestRow }> {
  const res = await apiFetchWithOffline("/api/ai/actions/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || "AI 승인 처리 실패")
  return JSON.parse(text) as { ok: true; request: AiActionRequestRow }
}

export async function getAiActionHistory(limit = 30): Promise<{ items: AiActionRequestRow[] }> {
  const res = await apiFetchWithOffline(`/api/ai/actions/history?limit=${Math.max(1, Math.min(limit, 200))}`)
  const text = await res.text()
  if (!res.ok) throw new Error(text || "AI 이력 조회 실패")
  return JSON.parse(text) as { items: AiActionRequestRow[] }
}

export interface AiMetrics {
  pendingApprovals: number
  executedToday: number
  failedToday: number
  successRate7d: number
  promptTokensToday?: number
  completionTokensToday?: number
  totalTokensToday?: number
}

export async function getAiMetrics(): Promise<AiMetrics> {
  const res = await apiFetchWithOffline("/api/ai/metrics")
  const text = await res.text()
  if (!res.ok) throw new Error(text || "AI 지표 조회 실패")
  return JSON.parse(text) as AiMetrics
}

export async function syncExternalContext(days = 7): Promise<{ ok: boolean; synced: number; message?: string }> {
  const res = await apiFetchWithOffline("/api/ai/external/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || "외부 환경 동기화 실패")
  return JSON.parse(text) as { ok: boolean; synced: number; message?: string }
}
