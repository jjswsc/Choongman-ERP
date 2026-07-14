/**
 * POS·근태 QR 단말 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import type { PosTableItem } from './pos-table-printer'

export async function clearPosMainDevice(params: { storeCode: string; deviceToken?: string }) {
  const res = await apiFetchWithOffline('/api/clearPosMainDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; code?: string }>
}

export async function registerPosMainDevice(params: { storeCode: string; deviceToken: string }) {
  const res = await apiFetchWithOffline('/api/registerPosMainDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; code?: string }>
}

export interface PosDeviceItem {
  deviceToken: string
  role: 'main' | 'order'
  lastSeenAt: string
  createdAt: string
  isMain: boolean
  displayLabel: string | null
  clientHint: string | null
}

export async function getPosDevices(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosDevices?' + q.toString())
  const data = await res.json() as { success: boolean; message?: string; devices?: PosDeviceItem[] }
  return { ...data, devices: data.devices ?? [] }
}

export async function registerPosDevice(params: {
  storeCode: string
  deviceToken: string
  role: 'main' | 'order'
  /** 브라우저 UA·OS 등 (선택). 접속 시마다 갱신되면 목록에서 단말 구분에 도움 */
  clientHint?: string
}) {
  const res = await apiFetchWithOffline('/api/registerPosDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      deviceToken: params.deviceToken,
      role: params.role,
      ...(params.clientHint != null && String(params.clientHint).trim()
        ? { clientHint: String(params.clientHint).trim().slice(0, 240) }
        : {}),
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updatePosDeviceDisplayLabel(params: {
  storeCode: string
  deviceToken: string
  displayLabel: string
}) {
  const res = await apiFetchWithOffline('/api/updatePosDeviceDisplayLabel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      deviceToken: params.deviceToken,
      displayLabel: params.displayLabel,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function revokePosDevice(params: { storeCode: string; deviceToken: string }) {
  const res = await apiFetchWithOffline('/api/revokePosDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface AttendanceQrDeviceItem {
  deviceToken: string
  lastSeenAt: string
  createdAt: string
  displayLabel: string | null
  clientHint: string | null
}

export async function getAttendanceQrDevices(params: { storeCode: string }) {
  const q = new URLSearchParams({ storeCode: params.storeCode })
  const res = await apiFetch('/api/getAttendanceQrDevices?' + q.toString())
  const data = (await res.json()) as {
    success: boolean
    message?: string
    devices?: AttendanceQrDeviceItem[]
  }
  return { ...data, devices: data.devices ?? [] }
}

export async function registerAttendanceQrDevice(params: {
  storeCode: string
  deviceToken: string
  displayLabel?: string
  clientHint?: string
}) {
  const res = await apiFetch('/api/registerAttendanceQrDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; storeCode?: string; deviceToken?: string }>
}

export async function checkAttendanceQrDevice(params: { storeCode?: string; deviceToken: string }) {
  const q = new URLSearchParams({
    deviceToken: params.deviceToken,
  })
  const store = String(params.storeCode || '').trim()
  if (store) q.set('storeCode', store)
  const res = await fetch(`/api/checkAttendanceQrDevice?${q.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  })
  return res.json() as Promise<{
    success: boolean
    registered: boolean
    reason?: string
    storeCode?: string
    displayLabel?: string | null
    lastSeenAt?: string
    message?: string
  }>
}

export async function getAttendanceQrDisplay(params: { storeCode?: string; deviceToken: string }) {
  const q = new URLSearchParams({
    deviceToken: params.deviceToken,
  })
  const store = String(params.storeCode || '').trim()
  if (store) q.set('storeCode', store)
  const res = await fetch(`/api/getAttendanceQrDisplay?${q.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'X-Cm-Client-Hint': typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 240) : '',
    },
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    storeCode?: string
    qrPayload?: string
    expiresAt?: string
    bucketStartMs?: number
    bucketHours?: number
    displayLabel?: string | null
  }>
}

export async function setPosMainDevice(params: { storeCode: string; deviceToken: string }) {
  const res = await apiFetchWithOffline('/api/setPosMainDevice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode: params.storeCode, deviceToken: params.deviceToken }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; code?: string }>
}

export async function savePosDeviceRoleLimits(params: {
  storeCode: string
  mainDeviceMaxCount: number
  orderDeviceMaxCount: number
  mainDeviceRoleLocked: boolean
}) {
  const res = await apiFetch('/api/savePosDeviceRoleLimits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    mainDeviceMaxCount?: number
    orderDeviceMaxCount?: number
    mainDeviceRoleLocked?: boolean
  }>
}

export async function savePosTableLayout(params: {
  storeCode: string
  layout: PosTableItem[]
  /** 매장별 구역 표시명 (1~3). 생략 시 기본「n층」유지 */
  floorLabels?: Partial<Record<1 | 2 | 3, string>>
}) {
  const res = await apiFetchWithOffline('/api/savePosTableLayout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
