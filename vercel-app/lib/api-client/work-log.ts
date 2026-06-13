/**
 * 업무일지(Work Log) API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsPlainObject, jsonAsStringArray, jsonAsArray } from '../safe-api-json'

export interface WorkLogItem {
  id: string
  content: string
  progress: number
  status: string
  priority: string
  managerCheck?: string
  managerComment?: string
}

export interface WorkLogData {
  finish: WorkLogItem[]
  continueItems: WorkLogItem[]
  todayItems: WorkLogItem[]
}

export async function getWorkLogStaffList() {
  const res = await apiFetchWithOffline('/api/getWorkLogStaffList')
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    staff: jsonAsArray<{ id: number; name: string; displayName: string }>(o.staff),
  }
}

export async function getWorkLogOfficeOptions(scope?: 'all' | 'office') {
  const q = scope ? `?scope=${scope}` : ''
  const res = await apiFetchWithOffline(`/api/getWorkLogOfficeOptions${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    staff: jsonAsArray<{ id: number; name: string; displayName: string; store?: string }>(o.staff),
    depts: jsonAsStringArray(o.depts),
    stores: jsonAsStringArray(o.stores),
  }
}

export async function getWorkLogData(params: {
  dateStr: string
  name: string
  /** 있으면 이름 매칭보다 우선(employees.id) */
  employeeId?: number
}) {
  const q = new URLSearchParams({
    dateStr: params.dateStr,
    name: params.name,
  })
  if (params.employeeId != null && params.employeeId > 0) {
    q.set('employeeId', String(params.employeeId))
  }
  const res = await apiFetchWithOffline(`/api/getWorkLogData?${q}`)
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { finish: [], continueItems: [], todayItems: [] }
  }
  const o = raw as Record<string, unknown>
  return {
    finish: jsonAsArray<WorkLogItem>(o.finish),
    continueItems: jsonAsArray<WorkLogItem>(o.continueItems),
    todayItems: jsonAsArray<WorkLogItem>(o.todayItems),
  }
}

export async function saveWorkLogData(params: {
  date: string
  name: string
  logs: WorkLogItem[]
  employeeId?: number
}) {
  const res = await apiFetchWithOffline('/api/saveWorkLogData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function submitDailyClose(params: {
  date: string
  name: string
  logs: WorkLogItem[]
  employeeId?: number
}) {
  const res = await apiFetchWithOffline('/api/submitDailyClose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateWorkLogManagerCheck(params: {
  id: string
  status: string
  comment?: string
}) {
  const res = await apiFetchWithOffline('/api/updateManagerCheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateWorkLogPriority(params: { id: string; priority: string }) {
  const res = await apiFetchWithOffline('/api/updateWorkLogPriority', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; messageKey?: string }>
}

export async function deleteWorkLogItem(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteWorkLogItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; messageKey?: string; message?: string }>
}

export interface WorkLogManagerItem {
  id: string
  date: string
  dept: string
  name: string
  content: string
  progress: number
  status: string
  priority: string
  managerCheck: string
  managerComment: string
}

export async function getWorkLogManagerReport(params: {
  startStr: string
  endStr: string
  dept?: string
  employee?: string
  status?: string
  store?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.dept && params.dept !== 'all') q.set('dept', params.dept)
  if (params.employee && params.employee !== 'all') q.set('employee', params.employee)
  if (params.status && params.status !== 'all') q.set('status', params.status)
  if (params.store && params.store !== 'all') q.set('store', params.store)
  const res = await apiFetchWithOffline(`/api/getWorkLogManagerReport?${q}`)
  return jsonAsArray<WorkLogManagerItem>(await res.json())
}

export interface WorkLogWeeklySummary {
  employee: string
  role: string
  totalTasks: number
  completed: number
  carried: number
  inProgress: number
  avgProgress: number
}

export async function getWorkLogWeekly(params: {
  startStr: string
  endStr: string
  dept?: string
  employee?: string
  store?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.dept && params.dept !== 'all') q.set('dept', params.dept)
  if (params.employee && params.employee !== 'all') q.set('employee', params.employee)
  if (params.store && params.store !== 'all') q.set('store', params.store)
  const res = await apiFetchWithOffline(`/api/getWorkLogWeekly?${q}`)
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { summaries: [], totalTasks: 0, totalCompleted: 0, totalCarried: 0, overallAvg: 0 }
  }
  const o = raw as Record<string, unknown>
  return {
    summaries: jsonAsArray<WorkLogWeeklySummary>(o.summaries),
    totalTasks: Number(o.totalTasks) || 0,
    totalCompleted: Number(o.totalCompleted) || 0,
    totalCarried: Number(o.totalCarried) || 0,
    overallAvg: Number(o.overallAvg) || 0,
  }
}

export interface WorkLogPeriodDay {
  date: string
  totalTasks: number
  completed: number
  inProgress: number
  carried: number
  avgProgress: number
  hasActivity: boolean
}

export async function getWorkLogPeriodSummary(params: {
  startStr: string
  endStr: string
  employeeId?: number
  name?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.employeeId != null && params.employeeId > 0) q.set('employeeId', String(params.employeeId))
  if (params.name) q.set('name', params.name)
  const res = await apiFetchWithOffline(`/api/getWorkLogPeriodSummary?${q}`)
  const raw = (await res.json()) as { days?: unknown }
  return jsonAsArray<WorkLogPeriodDay>(raw.days)
}

export interface WorkLogAuditItem {
  id?: number
  action_type?: string
  changed_at?: string
  work_log_id?: string
  log_date?: string
  employee_id?: number
  employee_name?: string
  employee_store?: string
  actor_name?: string
  actor_role?: string
  change_reason?: string
  before_row?: Record<string, unknown>
  after_row?: Record<string, unknown>
}

export async function getWorkLogAudit(params: {
  startStr?: string
  endStr?: string
  employeeId?: string
  store?: string
  limit?: number
}) {
  const q = new URLSearchParams()
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.employeeId) q.set('employeeId', params.employeeId)
  if (params.store) q.set('store', params.store)
  if (params.limit) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline(`/api/getWorkLogAudit?${q}`)
  const raw = (await res.json()) as { items?: unknown; forbidden?: boolean }
  return {
    items: jsonAsArray<WorkLogAuditItem>(raw.items),
    forbidden: res.status === 403 || Boolean(raw.forbidden),
  }
}

export interface WorkLogEmployeeInsights {
  employeeName?: string
  employeeStore?: string
  work: { log_date: string; total_tasks: number; completed: number; carried: number; avg_progress: number }[]
  attendance: { log_date: string; clock_in_count: number; clock_out_count: number; ot_min_sum: number }[]
  evaluations: { eval_date: string; eval_type: string; final_grade: string; store_name: string; evaluator: string }[]
}

export async function getWorkLogEmployeeInsights(params: {
  startStr: string
  endStr: string
  employeeId?: string
  store?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.employeeId && params.employeeId !== 'all') q.set('employeeId', params.employeeId)
  if (params.store && params.store !== 'all') q.set('store', params.store)
  const res = await apiFetchWithOffline(`/api/getWorkLogEmployeeInsights?${q}`)
  return (await res.json()) as WorkLogEmployeeInsights
}
