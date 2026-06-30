/**
 * 인사(HR) — 근태·휴가 API 클라이언트 (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface TodayAttendanceState {
  types: string[]
  canBreakStart: boolean
  canBreakEnd: boolean
  isOnBreak: boolean
  hasClockIn?: boolean
  hasClockOut?: boolean
}

export async function getTodayAttendanceTypes(params: {
  storeName: string
  name: string
  employeeId?: number
  employeeCode?: string
}) {
  const q = new URLSearchParams({
    storeName: params.storeName,
    name: params.name,
  })
  if (params.employeeId != null && params.employeeId > 0) q.set('employeeId', String(params.employeeId))
  if (params.employeeCode != null && String(params.employeeCode).trim())
    q.set('employeeCode', String(params.employeeCode).trim())
  const res = await apiFetchWithOffline(`/api/getTodayAttendanceTypes?${q}`)
  const raw: unknown = await res.json()
  // 구버전 API: string[] 만 반환 (클라만 먼저 배포된 경우 대비)
  if (Array.isArray(raw)) {
    const types = raw.filter((x): x is string => typeof x === 'string')
    const hasClockIn = types.includes('출근')
    const hasClockOut = types.includes('퇴근')
    const hasBreakStart = types.includes('휴식시작')
    const hasBreakEnd = types.includes('휴식종료')
    const isOnBreak = hasBreakStart && !hasBreakEnd
    return {
      types,
      canBreakStart: hasClockIn && !hasClockOut && !isOnBreak,
      canBreakEnd: hasClockIn && !hasClockOut && isOnBreak,
      isOnBreak,
    }
  }
  const o = raw as Record<string, unknown>
  const types = Array.isArray(o.types) ? o.types.filter((x): x is string => typeof x === 'string') : []
  const hasClockIn =
    o.hasClockIn === true || types.includes('출근') || o.canBreakStart === true || o.canBreakEnd === true
  const hasClockOut = o.hasClockOut === true || (types.includes('퇴근') && !hasClockIn)
  return {
    types,
    canBreakStart: o.canBreakStart === true,
    canBreakEnd: o.canBreakEnd === true,
    isOnBreak: o.isOnBreak === true,
    hasClockIn,
    hasClockOut,
  }
}

export interface AttendanceLogItem {
  timestamp: string
  type: string
  status: string
  late_min?: number
  ot_min?: number
  approved?: string
}

export async function getAttendanceList(params: {
  startDate: string
  endDate: string
  storeFilter: string
  employeeFilter: string
  employeeId?: number
  /** employees.employee_code — 레거시 로그(employee_id NULL) 병합용 */
  employeeCode?: string
}) {
  const q = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    storeFilter: params.storeFilter,
    employeeFilter: params.employeeFilter,
  })
  if (params.employeeId != null && params.employeeId > 0) q.set('employeeId', String(params.employeeId))
  if (params.employeeCode != null && String(params.employeeCode).trim())
    q.set('employeeCode', String(params.employeeCode).trim())
  const res = await apiFetchWithOffline(`/api/getAttendanceList?${q}`)
  return jsonAsArray<AttendanceLogItem>(await res.json())
}

export async function submitAttendance(params: {
  storeName: string
  name: string
  type: string
  lat: string | number
  lng: string | number
  employeeId?: number
  /** 선택; 서버는 employees에서 코드를 다시 확인해 스냅샷 저장 */
  employeeCode?: string
  /** phase 2: 키오스크 QR payload — 오피스 파일럿 시 GPS 대신 사용 */
  attendanceQrToken?: string
}) {
  const res = await apiFetchWithOffline('/api/submitAttendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; code?: string }>
}

export async function requestLeave(params: {
  store: string
  name: string
  type: string
  date: string
  reason: string
  employeeId?: number
}) {
  const res = await apiFetchWithOffline('/api/requestLeave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface LeaveHistoryItem {
  id?: number
  date: string
  type: string
  reason: string
  status: string
  certificateUrl?: string
  /** 반려 시 관리자가 입력한 사유 (모바일에서 확인 가능) */
  rejectReason?: string
}

const DEFAULT_MY_LEAVE_INFO_STATS: {
  usedAnn: number
  usedSick: number
  usedUnpaid: number
  usedLakij: number
  remain: number
  remainLakij: number
  remainSick: number
  annualTotal: number
  lakijTotal: number
  sickTotal: number
} = {
  usedAnn: 0,
  usedSick: 0,
  usedUnpaid: 0,
  usedLakij: 0,
  remain: 15,
  remainLakij: 3,
  remainSick: 30,
  annualTotal: 6,
  lakijTotal: 3,
  sickTotal: 30,
}

function normalizeMyLeaveInfoStats(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_MY_LEAVE_INFO_STATS }
  const s = raw as Record<string, unknown>
  return {
    usedAnn: Number(s.usedAnn) || 0,
    usedSick: Number(s.usedSick) || 0,
    usedUnpaid: Number(s.usedUnpaid) || 0,
    usedLakij: Number(s.usedLakij) || 0,
    remain: Number(s.remain) || 0,
    remainLakij: Number(s.remainLakij) || 0,
    remainSick: Number(s.remainSick) || 0,
    annualTotal: Number(s.annualTotal) || 0,
    lakijTotal: Number(s.lakijTotal) || 0,
    sickTotal: Number(s.sickTotal) || 0,
  }
}

export async function getMyLeaveInfo(params: { store: string; name: string; employeeId?: number }): Promise<{
  history: LeaveHistoryItem[]
  stats: typeof DEFAULT_MY_LEAVE_INFO_STATS
}> {
  const q = new URLSearchParams()
  q.set('store', params.store)
  q.set('name', params.name)
  if (params.employeeId != null && params.employeeId > 0) q.set('employeeId', String(params.employeeId))
  const res = await apiFetchWithOffline(`/api/getMyLeaveInfo?${q}`)
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { history: [], stats: { ...DEFAULT_MY_LEAVE_INFO_STATS } }
  }
  const o = raw as Record<string, unknown>
  const history = Array.isArray(o.history) ? (o.history as LeaveHistoryItem[]) : []
  return {
    history,
    stats: normalizeMyLeaveInfoStats(o.stats),
  }
}

export async function uploadLeaveCertificate(params: {
  id: number
  store: string
  name: string
  certificateUrl: string
}) {
  const res = await apiFetchWithOffline('/api/uploadLeaveCertificate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
