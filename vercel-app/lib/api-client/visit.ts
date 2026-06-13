/**
 * 매장 방문(Visit) API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface TodayVisitItem {
  time: string
  store: string
  type: string
  duration: number
}

export async function getTodayMyVisits(params: { userName: string }) {
  const q = new URLSearchParams({ userName: params.userName })
  const res = await apiFetchWithOffline(`/api/getTodayMyVisits?${q}`)
  return jsonAsArray<TodayVisitItem>(await res.json())
}

export async function checkUserVisitStatus(params: { userName: string }) {
  const q = new URLSearchParams({ userName: params.userName })
  const res = await apiFetchWithOffline(`/api/checkUserVisitStatus?${q}`)
  return res.json() as Promise<{ active: boolean; storeName?: string; purpose?: string }>
}

export async function submitStoreVisit(params: {
  userName: string
  storeName: string
  type: string
  purpose?: string
  lat?: string | number
  lng?: string | number
  clientTimestamp?: number
  /** 매장 키오스크 QR payload */
  attendanceQrToken?: string
}) {
  const res = await apiFetchWithOffline('/api/submitStoreVisit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; msg?: string }>
}
