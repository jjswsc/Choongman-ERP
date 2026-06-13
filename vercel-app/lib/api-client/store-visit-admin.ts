/**
 * 매장 방문 현황(관리자) API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface StoreVisitHistoryItem {
  date: string
  time: string
  name: string
  store: string
  type: string
  purpose: string
  duration?: number
}

export async function getStoreVisitHistory(params: {
  startStr: string
  endStr: string
  store?: string
  employeeName?: string
  department?: string
  purpose?: string
}) {
  const q = new URLSearchParams({
    start: params.startStr,
    end: params.endStr,
    ...(params.store && params.store !== 'All' && { store: params.store }),
    ...(params.employeeName && params.employeeName !== 'All' && { employeeName: params.employeeName }),
    ...(params.department && params.department !== 'All' && { department: params.department }),
    ...(params.purpose && { purpose: params.purpose }),
  })
  const res = await apiFetchWithOffline(`/api/getStoreVisitHistory?${q}`)
  return jsonAsArray<StoreVisitHistoryItem>(await res.json())
}

export interface StoreVisitTodaySnapshotActive {
  name: string
  department: string
  store: string
  purpose: string
  startedAt: string
}

export interface StoreVisitTodaySnapshotSegment {
  name: string
  department: string
  store: string
  purpose: string
  startAt: string
  endAt: string | null
  ongoing: boolean
}

export interface StoreVisitTodaySnapshotByStore {
  store: string
  activeCount: number
  segmentsTodayCount: number
}

export async function getStoreVisitTodaySnapshot(params?: { userStore?: string; userRole?: string }) {
  const q = new URLSearchParams()
  if (params?.userStore) q.set("userStore", params.userStore)
  if (params?.userRole) q.set("userRole", params.userRole)
  const qs = q.toString()
  const res = await apiFetchWithOffline(`/api/getStoreVisitTodaySnapshot${qs ? `?${qs}` : ""}`)
  return res.json() as Promise<{
    today: string
    active: StoreVisitTodaySnapshotActive[]
    segments: StoreVisitTodaySnapshotSegment[]
    byStore: StoreVisitTodaySnapshotByStore[]
    error?: string
  }>
}

export interface StoreVisitStatsItem {
  label: string
  minutes: number
}

export async function getStoreVisitStats(params: { startStr: string; endStr: string }) {
  const q = new URLSearchParams({ start: params.startStr, end: params.endStr })
  const res = await apiFetchWithOffline(`/api/getStoreVisitStats?${q}`)
  return res.json() as Promise<{
    byDept: StoreVisitStatsItem[]
    byEmployee: StoreVisitStatsItem[]
    byStore: StoreVisitStatsItem[]
    byPurpose: StoreVisitStatsItem[]
  }>
}

export interface VisitRecord {
  id: number
  employee: string
  department: string
  store: string
  purpose: string
  date: string
  durationMin: number
}

export async function getStoreVisitRecords(params: {
  startStr: string
  endStr: string
  store?: string
  employeeName?: string
  department?: string
  purpose?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
    ...(params.userStore && { userStore: params.userStore }),
    ...(params.userRole && { userRole: params.userRole }),
    ...(params.store && params.store !== "__ALL__" && { store: params.store }),
    ...(params.employeeName && params.employeeName !== "__ALL__" && { employeeName: params.employeeName }),
    ...(params.department && params.department !== "__ALL__" && { department: params.department }),
    ...(params.purpose && params.purpose !== "__ALL__" && { purpose: params.purpose }),
  })
  const res = await apiFetchWithOffline(`/api/getStoreVisitRecords?${q}`)
  return jsonAsArray<VisitRecord>(await res.json())
}
