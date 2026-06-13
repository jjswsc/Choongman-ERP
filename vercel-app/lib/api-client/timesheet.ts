/**
 * 시간표(Timesheet) API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface TodayScheduleItem {
  date: string
  store: string
  name: string
  nick: string
  pIn: string
  pOut: string
  pBS: string
  pBE: string
  area: string
  plan_in_prev_day?: boolean
  /** 승인된 휴가일 때 종류 (병가, 휴가, ลากิจ 등) */
  leaveType?: string
  /** 당일 출근 요약과 조인 (직원코드 > id > 이름) */
  joinKey?: string
  employeeCode?: string
  /** schedules.employee_id — joinKey 불일치 시 보조 매칭 */
  employeeId?: number
}

export interface TodayAttendanceItem {
  store: string
  name: string
  /** employees.nick — 실시간 격자에서 표시명(nick)과 출근 요약(풀네임) 조인 보강 */
  nick?: string
  inTimeStr: string
  outTimeStr: string
  lateMin: number
  status: string
  onlyIn: boolean
  joinKey?: string
  employeeCode?: string
  /** attendance_logs.employee_id — joinKey 불일치 시 보조 매칭 */
  employeeId?: number
}

export async function getTodaySchedule(params: { store: string; date: string }) {
  const q = new URLSearchParams(params)
  const res = await apiFetchWithOffline(`/api/getTodaySchedule?${q}`)
  return jsonAsArray<TodayScheduleItem>(await res.json())
}

export async function getTodayAttendanceSummary(params: {
  store: string
  date: string
}) {
  const q = new URLSearchParams(params)
  const res = await apiFetchWithOffline(`/api/getTodayAttendanceSummary?${q}`)
  return jsonAsArray<TodayAttendanceItem>(await res.json())
}

export type WeeklyScheduleItem = TodayScheduleItem

export async function getWeeklySchedule(params: {
  store: string
  monday: string
  area?: string
}) {
  const q = new URLSearchParams({
    store: params.store,
    monday: params.monday,
  })
  if (params.area && params.area !== 'All') q.set('area', params.area)
  const res = await apiFetchWithOffline(`/api/getWeeklySchedule?${q}`)
  return jsonAsArray<WeeklyScheduleItem>(await res.json())
}

export async function saveSchedule(params: {
  store: string
  monday: string
  rows: { date: string; name: string; pIn?: string; pOut?: string; pBS?: string; pBE?: string; remark?: string; plan_in_prev_day?: boolean }[]
}) {
  const res = await apiFetchWithOffline('/api/saveSchedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; duplicateNames?: string }>
}

export interface MyAttendanceSummary {
  normalDays: number
  otHours: number
  otDays: number
  lateMinutes: number
  lateDays: number
}

export async function getMyAttendanceSummary(params: {
  store: string
  name: string
  yearMonth: string
}) {
  const q = new URLSearchParams({
    store: params.store,
    name: params.name,
    yearMonth: params.yearMonth,
  })
  const res = await apiFetchWithOffline(`/api/getMyAttendanceSummary?${q}`)
  return res.json() as Promise<MyAttendanceSummary>
}
