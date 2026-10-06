import { supabaseSelectFilter } from '@/lib/supabase-server'
import { upsertRowsTenantStore } from '@/lib/saas-store-conflict'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  isNativeOfficeRole,
  isSupervisorRole,
  isManagerRole,
  isOfficeStore,
  isOmniManagerOfficeEquivalent,
  type PermissionBrandKey,
} from '@/lib/permissions'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

export type AttendanceQrDeviceRow = {
  store_code: string
  device_token: string
  role: string
  last_seen_at: string
  created_at: string
  display_label?: string | null
  client_hint?: string | null
  tenant_id?: string | null
}

/**
 * 회사(tenant)를 알고 있으면 그 회사 행만 본다.
 * 로그인·매장으로 회사를 특정할 수 없을 때만 토큰 단독 조회(키오스크가 로그인 없이 QR을 유지).
 */
export function allowUnscopedAttendanceQrTokenLookup(scope: SaasTenantScope): boolean {
  return !(scope.enforce && String(scope.tenantId || '').trim())
}

async function resolveQrDeviceTenantScope(
  storeCode: string | null | undefined,
  tenantScope?: SaasTenantScope
): Promise<SaasTenantScope> {
  if (tenantScope) return tenantScope
  return resolveSaasTenantScope({ storeCode: storeCode || null })
}

export async function fetchAttendanceQrDevice(
  storeCode: string,
  deviceToken: string,
  tenantScope?: SaasTenantScope
): Promise<AttendanceQrDeviceRow | null> {
  const store = String(storeCode || '').trim()
  const token = String(deviceToken || '').trim()
  if (!store || !token) return null
  const scope = await resolveQrDeviceTenantScope(store, tenantScope)
  if (isSaasTenantQueryBlocked(scope, 'pos_connected_devices')) return null
  const baseFilter = `store_code=eq.${encodeURIComponent(store)}&device_token=eq.${encodeURIComponent(token)}&role=eq.attendance_display`
  const filter = appendSaasTenantFilter(baseFilter, scope, 'pos_connected_devices')
  try {
    const rows = (await supabaseSelectFilter('pos_connected_devices', filter, { limit: 1 })) as
      | AttendanceQrDeviceRow[]
      | null
    return rows?.[0] ?? null
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('pos_connected_devices')
      const rows = (await supabaseSelectFilter('pos_connected_devices', baseFilter, { limit: 1 })) as
        | AttendanceQrDeviceRow[]
        | null
      return rows?.[0] ?? null
    }
    throw e
  }
}

/** localStorage 매장 코드 유실 시 — 등록된 토큰만으로 단말 복구 (동일 토큰이 2매장 이상이면 null) */
async function readAttendanceQrDeviceByTokenFilter(
  filter: string
): Promise<AttendanceQrDeviceRow | null> {
  const rows = (await supabaseSelectFilter('pos_connected_devices', filter, { limit: 2 })) as
    | AttendanceQrDeviceRow[]
    | null
  if (!rows?.length) return null
  if (rows.length > 1) return null
  return rows[0] ?? null
}

export async function fetchAttendanceQrDeviceByToken(
  deviceToken: string,
  tenantScope?: SaasTenantScope
): Promise<AttendanceQrDeviceRow | null> {
  const token = String(deviceToken || '').trim()
  if (!token || token.length < 10) return null
  const scope = tenantScope ?? (await resolveSaasTenantScope({}))
  const baseFilter = `device_token=eq.${encodeURIComponent(token)}&role=eq.attendance_display`
  const scopedFilter = appendSaasTenantFilter(baseFilter, scope, 'pos_connected_devices')
  try {
    if (!isSaasTenantQueryBlocked(scope, 'pos_connected_devices')) {
      const scoped = await readAttendanceQrDeviceByTokenFilter(scopedFilter)
      if (scoped) return scoped
      if (!allowUnscopedAttendanceQrTokenLookup(scope)) return null
    }
    /**
     * 키오스크 QR 표시는 로그인 없이 동작해야 한다.
     * 회사를 특정하지 못할 때만 토큰 단독 조회를 허용한다.
     * 로그인한 회사가 있으면 다른 회사 단말로 넘어가지 않는다.
     */
    return await readAttendanceQrDeviceByTokenFilter(baseFilter)
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('pos_connected_devices')
      return await readAttendanceQrDeviceByTokenFilter(baseFilter)
    }
    throw e
  }
}

export async function touchAttendanceQrDevice(params: {
  storeCode: string
  deviceToken: string
  clientHint?: string
  tenantScope?: SaasTenantScope
}): Promise<void> {
  const scope = await resolveQrDeviceTenantScope(params.storeCode, params.tenantScope)
  const row = await fetchAttendanceQrDevice(params.storeCode, params.deviceToken, scope)
  if (!row) return
  const now = new Date().toISOString()
  const upsertRow = stampSaasTenantId(
    {
      store_code: row.store_code,
      device_token: row.device_token,
      role: 'attendance_display',
      last_seen_at: now,
      ...(params.clientHint ? { client_hint: params.clientHint.slice(0, 240) } : {}),
    },
    scope,
    'pos_connected_devices'
  )
  await upsertRowsTenantStore('pos_connected_devices', 'store_code,device_token', [upsertRow], scope)
}

export function canAuthManageAttendanceQrStore(params: {
  authStore: string
  authRole: string
  allowedStores?: string[]
  targetStore: string
  brandKey?: PermissionBrandKey
}): boolean {
  const target = String(params.targetStore || '').trim()
  if (!target) return false
  const role = String(params.authRole || '')
  const brandKey = params.brandKey
  const authStore = String(params.authStore || '').trim()
  /** Officer·Director 등 본사 계정 — Omni 초기 admin(Officer, 첫 매장 소속) 포함 */
  if (isNativeOfficeRole(role)) return true
  if (isSupervisorRole(role)) {
    if (isOfficeStore(authStore)) return true
    return storesMatchForGradeLookup(authStore, target)
  }
  /** Omni Manager는 isManagerRole=false — 매장 Manager와 동일하게 자기 매장, 본사 소속이면 전 매장 */
  if (isManagerRole(role, brandKey) || isOmniManagerOfficeEquivalent(role, brandKey)) {
    if (isOmniManagerOfficeEquivalent(role, brandKey) && isOfficeStore(authStore)) return true
    return storesMatchForGradeLookup(authStore, target)
  }
  return false
}
