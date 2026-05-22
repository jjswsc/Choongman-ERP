import { apiFetchWithOffline } from "@/lib/api-client"

export type AiIntent = "qa" | "reporting" | "ops_recommend"

export interface AiScopeMeta {
  requestedStore: string
  resolvedStore: string
  isStoreCoerced: boolean
  storeScope: "all" | "own_store"
}

export interface AiAskPolicyMeta extends AiScopeMeta {
  requestedStart: string
  requestedEnd: string
  resolvedStart: string
  resolvedEnd: string
  maxDateRangeDays: number
  isDateRangeClamped: boolean
}

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
  meta?: AiAskPolicyMeta
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

export class AiApiError extends Error {
  status: number
  code: string | null

  constructor(message: string, status: number, code?: string | null) {
    super(message)
    this.name = "AiApiError"
    this.status = status
    this.code = code || null
  }
}

function parseAiApiError(text: string, fallback: string): { message: string; code: string | null } {
  try {
    const parsed = JSON.parse(text) as { error?: unknown; code?: unknown }
    const message = String(parsed.error || "").trim() || fallback
    const code = parsed.code == null ? null : String(parsed.code)
    return { message, code }
  } catch {
    const message = String(text || "").trim() || fallback
    return { message, code: null }
  }
}

export interface AiCenterHealthResponse {
  step: number
  label: string
  allTablesOk: boolean
  openaiConfigured: boolean
  readyForStep1: boolean
  tables: Record<string, { ok: boolean; error?: string }>
  nextActions: string[]
}

export async function getAiCenterHealth(): Promise<AiCenterHealthResponse> {
  const res = await apiFetchWithOffline("/api/ai/health")
  const text = await res.text()
  if (!res.ok) {
    const parsed = parseAiApiError(text, "AI 상태 확인 실패")
    throw new AiApiError(parsed.message, res.status, parsed.code)
  }
  return JSON.parse(text) as AiCenterHealthResponse
}

export async function askAiCenter(payload: AiAskRequest): Promise<AiAskResponse> {
  const res = await apiFetchWithOffline("/api/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (!res.ok) {
    const parsed = parseAiApiError(text, "AI 질의 실패")
    throw new AiApiError(parsed.message, res.status, parsed.code)
  }
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
  if (!res.ok) {
    const parsed = parseAiApiError(text, "AI 실행 제안 실패")
    throw new AiApiError(parsed.message, res.status, parsed.code)
  }
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
  if (!res.ok) {
    const parsed = parseAiApiError(text, "AI 승인 처리 실패")
    throw new AiApiError(parsed.message, res.status, parsed.code)
  }
  return JSON.parse(text) as { ok: true; request: AiActionRequestRow }
}

export async function getAiActionHistory(
  limit = 30,
  store?: string
): Promise<{ items: AiActionRequestRow[]; meta?: AiScopeMeta }> {
  const sp = new URLSearchParams()
  sp.set("limit", String(Math.max(1, Math.min(limit, 200))))
  if (store && String(store).trim()) sp.set("store", String(store).trim())
  const res = await apiFetchWithOffline(`/api/ai/actions/history?${sp.toString()}`)
  const text = await res.text()
  if (!res.ok) {
    const parsed = parseAiApiError(text, "AI 이력 조회 실패")
    throw new AiApiError(parsed.message, res.status, parsed.code)
  }
  return JSON.parse(text) as { items: AiActionRequestRow[]; meta?: AiScopeMeta }
}

export interface AiMetrics {
  pendingApprovals: number
  executedToday: number
  failedToday: number
  successRate7d: number
  promptTokensToday?: number
  completionTokensToday?: number
  totalTokensToday?: number
  meta?: AiScopeMeta
}

export async function getAiMetrics(store?: string): Promise<AiMetrics> {
  const sp = new URLSearchParams()
  if (store && String(store).trim()) sp.set("store", String(store).trim())
  const url = sp.toString() ? `/api/ai/metrics?${sp.toString()}` : "/api/ai/metrics"
  const res = await apiFetchWithOffline(url)
  const text = await res.text()
  if (!res.ok) {
    const parsed = parseAiApiError(text, "AI 지표 조회 실패")
    throw new AiApiError(parsed.message, res.status, parsed.code)
  }
  return JSON.parse(text) as AiMetrics
}

export async function syncExternalContext(days = 7): Promise<{ ok: boolean; synced: number; message?: string }> {
  const res = await apiFetchWithOffline("/api/ai/external/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days }),
  })
  const text = await res.text()
  if (!res.ok) {
    const parsed = parseAiApiError(text, "외부 환경 동기화 실패")
    throw new AiApiError(parsed.message, res.status, parsed.code)
  }
  return JSON.parse(text) as { ok: boolean; synced: number; message?: string }
}
