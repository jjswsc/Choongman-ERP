/**
 * 휴가·근태 승인 API — admin.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export async function getLeavePendingList(params: {
  startStr: string
  endStr: string
  store?: string
  status?: string
  typeFilter?: string
  userStore?: string
  userRole?: string
  dateFilterType?: 'request' | 'leave'
}) {
  const clean: Record<string, string> = {}
  if (params.startStr) clean.startStr = params.startStr
  if (params.endStr) clean.endStr = params.endStr
  if (params.store != null && params.store !== '') clean.store = params.store
  if (params.status) clean.status = params.status
  if (params.typeFilter != null && params.typeFilter !== '') clean.typeFilter = params.typeFilter
  if (params.userStore) clean.userStore = params.userStore
  if (params.userRole) clean.userRole = params.userRole
  if (params.dateFilterType) clean.dateFilterType = params.dateFilterType
  const q = new URLSearchParams(clean)
  const res = await apiFetchWithOffline(`/api/getLeavePendingList?${q}`)
  return res.json() as Promise<{
    id: number
    store: string
    name: string
    employeeCode: string
    nick: string
    type: string
    date: string
    requestDate: string
    requestTimeBangkok?: string
    reason: string
    status: string
    certificateUrl: string
  }[]>
}

export async function getLeaveStats(params: {
  startStr?: string
  endStr?: string
  store?: string
  userStore?: string
  userRole?: string
}) {
  const clean: Record<string, string> = {}
  if (params.startStr) clean.startStr = params.startStr
  if (params.endStr) clean.endStr = params.endStr
  if (params.store != null && params.store !== '') clean.store = params.store
  if (params.userStore) clean.userStore = params.userStore
  if (params.userRole) clean.userRole = params.userRole
  const q = new URLSearchParams(clean)
  const res = await apiFetchWithOffline(`/api/getLeaveStats?${q}`)
  return res.json() as Promise<
    {
      store: string
      name: string
      employeeCode: string
      usedPeriodAnnual: number
      usedPeriodSick: number
      usedPeriodUnpaid: number
      usedPeriodLakij: number
      usedTotalAnnual: number
      usedTotalSick: number
      usedTotalUnpaid: number
      usedTotalLakij: number
      remain: number
      remainLakij: number
      remainSick: number
    }[]
  >
}

export async function processLeaveApproval(params: { id: number; decision: string; userStore?: string; userRole?: string; rejectReason?: string }) {
  const res = await apiFetchWithOffline('/api/processLeaveApproval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getAttendancePendingList(params: {
  startStr: string
  endStr: string
  store?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams()
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.store != null && params.store !== '') q.set('store', params.store)
  if (params.userStore != null && params.userStore !== '') q.set('userStore', params.userStore)
  if (params.userRole != null && params.userRole !== '') q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getAttendancePendingList?${q}`)
  return jsonAsArray<{ id: number; log_at: string; store_name: string; name: string; log_type: string; status?: string; approved?: string }>(await res.json())
}

export async function processAttendanceApproval(params: {
  id: number
  decision: string
  optOtMinutes?: number | null
  optEarlyMinutes?: number | null
  optLateMinutes?: number | null
  optionalInLogId?: number | null
  waiveLate?: boolean
  userStore?: string
  userRole?: string
}) {
  const body: Record<string, unknown> = { id: params.id, decision: params.decision }
  if (params.optOtMinutes != null) body.optOtMinutes = Number(params.optOtMinutes)
  if (params.optEarlyMinutes != null) body.optEarlyMinutes = Number(params.optEarlyMinutes)
  if (params.optLateMinutes != null) body.optLateMinutes = Number(params.optLateMinutes)
  if (params.optionalInLogId != null && params.optionalInLogId > 0) body.optionalInLogId = Number(params.optionalInLogId)
  if (params.waiveLate) body.waiveLate = true
  if (params.userStore) body.userStore = params.userStore
  if (params.userRole) body.userRole = params.userRole
  const res = await apiFetchWithOffline('/api/processAttendanceApproval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface AttendanceNoRecordRow {
  date: string
  store: string
  name: string
  employeeId?: number
  employeeCode?: string
  nick?: string
  inTimeStr: string
  outTimeStr: string
  breakMin: number
  breakOverMin?: number
  planIn: string
  planOut: string
  breakStart: string
  breakEnd: string
  planInPrevDay?: boolean
}

export async function getAttendanceNoRecordList(params: {
  startStr: string
  endStr: string
  store?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams()
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.store != null && params.store !== '') q.set('store', params.store)
  if (params.userStore != null && params.userStore !== '') q.set('userStore', params.userStore)
  if (params.userRole != null && params.userRole !== '') q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getAttendanceNoRecordList?${q}`)
  return jsonAsArray<AttendanceNoRecordRow>(await res.json())
}

export async function createAttendanceFromSchedule(params: {
  date: string
  store: string
  name: string
  employeeId?: number
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/createAttendanceFromSchedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function approveNoClockOut(params: {
  date: string
  store: string
  name: string
  employeeId?: number
  /** 강제 퇴근 생성 시 조퇴(분). 미입력·0이면 계획 퇴근 시각 기준 */
  optEarlyMinutes?: number
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/approveNoClockOut', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface AttendanceDailyRow {
  date: string
  store: string
  name: string
  employeeId?: number
  employeeCode?: string
  inTimeStr: string
  outTimeStr: string
  breakMin: number
  breakOverMin?: number
  actualWorkHrs: number
  plannedWorkHrs: number
  diffMin: number
  lateMin: number
  lateBeforeMin?: number
  lateAfterMin?: number
  /** DB 저장값(퇴근 로그 early_min). 기존 건 조정 반영 시 사용 */
  earlyMin?: number
  earlyBeforeMin?: number
  earlyAfterMin?: number
  otMin: number
  otBeforeMin?: number
  otAfterMin?: number
  status: string
  approval: string
  pendingId: number | null
  pendingInId?: number | null
  pendingOutId?: number | null
  /** 출근 로그 id (지각 분 조정 시 사용, 승인 여부와 무관) */
  inLogId?: number | null
  /** 퇴근 로그 id (조정 반영 시 사용) */
  outLogId?: number | null
  inStatus?: string
  /** 파트타임/시급이면 계획 0이어도 빨간 행 미적용 */
  isPartTime?: boolean
}

export async function getAttendanceRecordsAdmin(params: {
  startDate: string
  endDate: string
  storeFilter?: string
  employeeFilter?: string
  employeeId?: number
  employeeCode?: string
  statusFilter?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams()
  if (params.startDate) q.set('startDate', params.startDate)
  if (params.endDate) q.set('endDate', params.endDate)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.employeeFilter) q.set('employeeFilter', params.employeeFilter)
  if (params.employeeId != null && params.employeeId > 0) q.set('employeeId', String(params.employeeId))
  if (params.employeeCode != null && String(params.employeeCode).trim())
    q.set('employeeCode', String(params.employeeCode).trim())
  if (params.statusFilter) q.set('statusFilter', params.statusFilter || 'all')
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getAttendanceRecordsAdmin?${q}`)
  const raw: unknown = await res.json()
  if (Array.isArray(raw)) {
    return raw as AttendanceDailyRow[]
  }
  return []
}
