/**
 * 직원 평가·경고서 API — employees.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { attachEvalAnalyticsRedirectFlag, parseEvalAnalyticsErrorResponse } from '../eval-analytics-http-error'

/** 평가 항목 조회 (kitchen | service | manager) */
export async function getEvaluationItems(params: {
  type: 'kitchen' | 'service' | 'manager'
  activeOnly?: boolean
}) {
  const q = new URLSearchParams({
    type: params.type,
    activeOnly: String(params.activeOnly === true),
  })
  const res = await apiFetchWithOffline(`/api/getEvaluationItems?${q}`)
  return res.json() as Promise<
    { id: string | number; main: string; sub: string; name: string; use?: boolean; sort_order?: number }[]
  >
}

/** evaluation_results 에 저장된 매장명 목록 (RPC 미배포 시 빈 배열) */
export async function getEvaluationDistinctStores(): Promise<{ stores: string[] }> {
  const res = await apiFetchWithOffline('/api/getEvaluationDistinctStores')
  if (!res.ok) return { stores: [] }
  return res.json() as Promise<{ stores: string[] }>
}

/** 평가 이력 조회 */
/** GET /api/getWarningLettersFromEvaluations — 평가 JSON에서 펼친 경고서 행 목록 */
export type WarningLetterRegistryRow = {
  id: number
  store_name: string
  employee_name: string
  incident_date: string | null
  incident_type: string
  details: string
  warning_letter_url: string | null
  evaluator_name: string
  approval_status: 'draft' | 'pending' | 'approved' | 'rejected'
  approved_by: string | null
  approved_at: string | null
  rejected_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type WarningLetterIncidentItem = {
  source?: 'evaluation' | 'registry'
  registryId?: number
  /** 직접 등록 건 등록자(표시명) — 재상신 버튼 노출 판단 등 */
  createdBy?: string
  approvalStatus?: 'draft' | 'pending' | 'approved' | 'rejected'
  rejectedReason?: string
  evaluationId: string
  evalDate: string
  evalType: 'kitchen' | 'service' | 'manager' | 'standalone'
  store: string
  employeeName: string
  evaluator: string
  finalGrade: string
  incidentIndex: number
  incidentType: string
  incidentDate: string
  details: string
  warningLetterChecked: boolean
  warningLetterUrl: string
}

export function mapWarningRegistryRowToIncident(row: WarningLetterRegistryRow): WarningLetterIncidentItem {
  const st = row.approval_status
  return {
    source: 'registry',
    registryId: row.id,
    createdBy: row.created_by ? String(row.created_by) : undefined,
    evaluationId: '',
    evalDate: String(row.incident_date || row.created_at || '').slice(0, 10),
    evalType: 'standalone',
    store: row.store_name,
    employeeName: row.employee_name,
    evaluator: row.evaluator_name,
    finalGrade: '',
    incidentIndex: 0,
    incidentType: row.incident_type,
    incidentDate: String(row.incident_date || '').slice(0, 10),
    details: row.details,
    warningLetterChecked:
      st === 'approved' || Boolean(String(row.warning_letter_url || '').trim()),
    warningLetterUrl: String(row.warning_letter_url || '').trim(),
    approvalStatus: st,
    rejectedReason: row.rejected_reason ? String(row.rejected_reason) : '',
  }
}

export async function getWarningLettersFromEvaluations(params: {
  type: string
  start?: string
  end?: string
  store?: string
  employee?: string
  evaluator?: string
  /** false면 내용 있는 전체 행. 기본 true = 발부·첨부 있는 행만 */
  warningsOnly?: boolean
}) {
  const q = new URLSearchParams()
  q.set('type', params.type || 'all')
  if (params.start) q.set('start', params.start)
  if (params.end) q.set('end', params.end)
  if (params.store) q.set('store', params.store)
  if (params.employee) q.set('employee', params.employee)
  if (params.evaluator) q.set('evaluator', params.evaluator)
  if (params.warningsOnly === false) q.set('warningsOnly', '0')
  const res = await apiFetchWithOffline(`/api/getWarningLettersFromEvaluations?${q}`)
  const data = (await res.json().catch(() => ({}))) as {
    items?: WarningLetterIncidentItem[]
    truncated?: boolean
    pageCap?: number
    error?: string
  }
  if (!res.ok) throw new Error(data.error || '조회 실패')
  return {
    items: Array.isArray(data.items) ? data.items : [],
    truncated: Boolean(data.truncated),
    pageCap: typeof data.pageCap === 'number' ? data.pageCap : undefined,
  }
}

export async function getWarningLetterRegistry(params: {
  start?: string
  end?: string
  store?: string
  employee?: string
  evaluator?: string
  approval?: string
}) {
  const q = new URLSearchParams()
  if (params.start) q.set('start', params.start)
  if (params.end) q.set('end', params.end)
  if (params.store) q.set('store', params.store)
  if (params.employee) q.set('employee', params.employee)
  if (params.evaluator) q.set('evaluator', params.evaluator)
  if (params.approval) q.set('approval', params.approval)
  const res = await apiFetchWithOffline(`/api/getWarningLetterRegistry?${q}`)
  const data = (await res.json().catch(() => ({}))) as {
    items?: WarningLetterRegistryRow[]
    summary?: { draft: number; pending: number; approved: number; rejected: number }
    truncated?: boolean
    pageCap?: number
    error?: string
  }
  if (!res.ok) throw new Error(data.error || '조회 실패')
  return {
    items: Array.isArray(data.items) ? data.items : [],
    summary: data.summary ?? { draft: 0, pending: 0, approved: 0, rejected: 0 },
    truncated: Boolean(data.truncated),
    pageCap: typeof data.pageCap === 'number' ? data.pageCap : undefined,
  }
}

export async function saveWarningLetterRegistry(body: {
  id?: number
  store_name: string
  employee_name: string
  incident_date: string
  incident_type?: string
  details?: string
  warning_letter_url?: string
  evaluator_name?: string
}) {
  const res = await apiFetchWithOffline('/api/saveWarningLetterRegistry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function presignWarningLetterRegistryUpload(params: {
  storeName: string
  fileName: string
  contentType: string
  fileSize: number
}) {
  const res = await apiFetchWithOffline('/api/uploadWarningLetterRegistry/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeName: params.storeName,
      fileName: params.fileName,
      contentType: params.contentType,
      fileSize: params.fileSize,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    signedUrl?: string
    publicUrl?: string
    storagePath?: string
    message?: string
  }>
}

/** presign 후 Supabase Storage에 직접 PUT (Vercel 경유 없음) */
export async function uploadWarningLetterRegistryFile(file: File, storeName: string): Promise<{ publicUrl: string }> {
  const presign = await presignWarningLetterRegistryUpload({
    storeName,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    fileSize: file.size,
  })
  if (!presign.success || !presign.signedUrl || !presign.publicUrl) {
    throw new Error(presign.message || 'presign failed')
  }
  const put = await fetch(presign.signedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!put.ok) {
    const errText = await put.text().catch(() => '')
    throw new Error(errText || `upload failed (${put.status})`)
  }
  return { publicUrl: presign.publicUrl }
}

export async function warningLetterRegistryAction(body: {
  id: number
  action: 'submit' | 'approve' | 'reject' | 'reopen'
  rejectedReason?: string
}) {
  const res = await apiFetchWithOffline('/api/warningLetterRegistryAction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteWarningLetterRegistry(body: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteWarningLetterRegistry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type EvaluationResultById = {
  id: string
  date: string
  store: string
  employeeName: string
  evaluator: string
  finalGrade: string
  memo: string
  totalScore: string
  jsonData?: string | Record<string, unknown>
  evalType: 'kitchen' | 'service' | 'manager'
}

/** 평가 1건 불러오기(이력·경고서에서 수정 폼으로 열기) */
export async function getEvaluationResultById(id: string) {
  const q = new URLSearchParams()
  q.set('id', String(id || '').trim())
  const res = await apiFetchWithOffline(`/api/getEvaluationResultById?${q}`)
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<EvaluationResultById>
  if (!res.ok) throw new Error(String(data?.error || '조회 실패'))
  return data as EvaluationResultById
}

export async function getEvaluationHistory(params: {
  type: string
  start?: string
  end?: string
  store?: string
  employee?: string
  evaluator?: string
}) {
  const q = new URLSearchParams()
  q.set('type', params.type || 'kitchen')
  if (params.start) q.set('start', params.start)
  if (params.end) q.set('end', params.end)
  if (params.store) q.set('store', params.store)
  if (params.employee) q.set('employee', params.employee)
  if (params.evaluator) q.set('evaluator', params.evaluator)
  const res = await apiFetchWithOffline(`/api/getEvaluationHistory?${q}`)
  return res.json() as Promise<
    {
      id: string
      date: string
      store: string
      employeeName: string
      evaluator: string
      finalGrade: string
      totalScore: string
      memo: string
      jsonData?: string
    }[]
  >
}

/** 평가 결과 1건 삭제 — 서버에서 JWT·매장 권한 검사 */
export async function deleteEvaluationResult(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteEvaluationResult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: params.id }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || '삭제 실패')
  return data as { ok?: boolean }
}

export type EvaluationAnalyticsPayload = {
  summary: {
    totalEvaluations: number
    uniqueEmployees: number
    avgTotalScore: number | null
  }
  gradeDistribution: Record<string, number>
  byStore: {
    store: string
    evaluations: number
    uniqueEmployees: number
    avgScore: number | null
  }[]
  byType: {
    evalType: string
    evaluations: number
    uniqueEmployees: number
    avgScore: number | null
  }[]
  byMonth: { yearMonth: string; evaluations: number; avgScore: number | null }[]
  byEvaluator: { evaluator: string; evaluations: number; avgScore: number | null }[]
  sectionAverages?: Record<string, number | null>
  source: 'rpc' | 'fallback'
  coverage?: {
    activeEmployeesInPeriod: number
    evaluatedEmployees: number
    unevaluatedEmployees: number
    unevaluated: { store: string; name: string; nick: string; job: string }[]
  } | null
}

/** 직원 평가 집계 (분석 탭) */
export async function getEvaluationAnalytics(params: {
  start: string
  end: string
  type?: string
  store?: string
}) {
  const q = new URLSearchParams()
  q.set('start', params.start.slice(0, 10))
  q.set('end', params.end.slice(0, 10))
  q.set('type', (params.type || 'all').trim())
  if (params.store && params.store !== 'All') q.set('store', params.store.trim())
  const res = await apiFetchWithOffline(`/api/getEvaluationAnalytics?${q}`)
  const text = await res.text()
  if (!res.ok) {
    const { message, redirectToAdminLogin } = parseEvalAnalyticsErrorResponse(res.status, text)
    throw attachEvalAnalyticsRedirectFlag(new Error(message || '집계 조회 실패'), redirectToAdminLogin)
  }
  return JSON.parse(text) as EvaluationAnalyticsPayload
}

/** 직원 평가 집계 AI 요약 (본사·회계, OPENAI_API_KEY 필요) */
export async function summarizeEvaluationAnalytics(params: {
  start: string
  end: string
  type?: string
  store?: string
}) {
  const res = await apiFetchWithOffline('/api/summarizeEvaluationAnalytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: params.start.slice(0, 10),
      end: params.end.slice(0, 10),
      type: (params.type || 'all').trim(),
      store: (params.store || 'All').trim(),
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    const { message, redirectToAdminLogin } = parseEvalAnalyticsErrorResponse(res.status, text)
    throw attachEvalAnalyticsRedirectFlag(new Error(message || '요약 실패'), redirectToAdminLogin)
  }
  return JSON.parse(text) as { summary: string; source: string }
}

/** 평가 항목 일괄 수정 */
export async function updateEvaluationItems(params: {
  type: 'kitchen' | 'service' | 'manager'
  updates: { id: string | number; main?: string; sub?: string; name?: string; use?: boolean; sort_order?: number }[]
}) {
  const res = await apiFetchWithOffline('/api/updateEvaluationItems', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: params.type,
      updates: params.updates,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '수정 실패')
  }
  return res.text() as Promise<string>
}

/** 평가 항목 추가 */
export async function addEvaluationItem(params: {
  type: 'kitchen' | 'service' | 'manager'
  mainCat?: string
  subCat?: string
  itemName?: string
}) {
  const res = await apiFetchWithOffline('/api/addEvaluationItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '추가 실패')
  }
  return res.text() as Promise<string>
}

/** 평가 항목 삭제 */
export async function deleteEvaluationItem(params: {
  type: 'kitchen' | 'service' | 'manager'
  itemId: string | number
}) {
  const res = await apiFetchWithOffline('/api/deleteEvaluationItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: params.type,
      itemId: params.itemId,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '삭제 실패')
  }
  return res.text() as Promise<string>
}

/** 평가 결과 저장 — 서버에서 JWT로 본사·회계·해당 매장 매니저/가맹점주만 허용 */
export async function saveEvaluationResult(params: {
  type: 'kitchen' | 'service' | 'manager'
  id?: string
  date: string
  store: string
  employeeName: string
  evaluator: string
  finalGrade: string
  memo: string
  jsonData: unknown
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/saveEvaluationResult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || '저장 실패')
  return text as 'SAVED' | 'UPDATED'
}
