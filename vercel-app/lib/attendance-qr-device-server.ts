import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isEmployeeAuthRoleDirector, isSupervisorRole, isManagerRole, isOfficeStore } from '@/lib/permissions'

export type AttendanceQrDeviceRow = {
  store_code: string
  device_token: string
  role: string
  last_seen_at: string
  created_at: string
  display_label?: string | null
  client_hint?: string | null
}

export async function fetchAttendanceQrDevice(
  storeCode: string,
  deviceToken: string
): Promise<AttendanceQrDeviceRow | null> {
  const store = String(storeCode || '').trim()
  const token = String(deviceToken || '').trim()
  if (!store || !token) return null
  const rows = (await supabaseSelectFilter(
    'pos_connected_devices',
    `store_code=eq.${encodeURIComponent(store)}&device_token=eq.${encodeURIComponent(token)}&role=eq.attendance_display`,
    { limit: 1 }
  )) as AttendanceQrDeviceRow[] | null
  return rows?.[0] ?? null
}

/** localStorage 매장 코드 유실 시 — 등록된 토큰만으로 단말 복구 (동일 토큰이 2매장 이상이면 null) */
export async function fetchAttendanceQrDeviceByToken(
  deviceToken: string
): Promise<AttendanceQrDeviceRow | null> {
  const token = String(deviceToken || '').trim()
  if (!token || token.length < 10) return null
  const rows = (await supabaseSelectFilter(
    'pos_connected_devices',
    `device_token=eq.${encodeURIComponent(token)}&role=eq.attendance_display`,
    { limit: 2 }
  )) as AttendanceQrDeviceRow[] | null
  if (!rows?.length) return null
  if (rows.length > 1) return null
  return rows[0] ?? null
}

export async function touchAttendanceQrDevice(params: {
  storeCode: string
  deviceToken: string
  clientHint?: string
}): Promise<void> {
  const row = await fetchAttendanceQrDevice(params.storeCode, params.deviceToken)
  if (!row) return
  const now = new Date().toISOString()
  await supabaseUpsert(
    'pos_connected_devices',
    [
      {
        store_code: row.store_code,
        device_token: row.device_token,
        role: 'attendance_display',
        last_seen_at: now,
        ...(params.clientHint ? { client_hint: params.clientHint.slice(0, 240) } : {}),
      },
    ],
    'store_code,device_token'
  )
}

export function canAuthManageAttendanceQrStore(params: {
  authStore: string
  authRole: string
  allowedStores?: string[]
  targetStore: string
}): boolean {
  const target = String(params.targetStore || '').trim()
  if (!target) return false
  const role = String(params.authRole || '')
  if (isEmployeeAuthRoleDirector(role) || isSupervisorRole(role)) {
    if (isOfficeStore(String(params.authStore || ''))) return true
    return storesMatchForGradeLookup(String(params.authStore || '').trim(), target)
  }
  if (isManagerRole(role)) {
    return storesMatchForGradeLookup(String(params.authStore || '').trim(), target)
  }
  return false
}
