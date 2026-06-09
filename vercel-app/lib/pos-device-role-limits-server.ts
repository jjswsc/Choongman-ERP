import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import {
  checkCanAssignMainFromRows,
  checkCanRegisterAsOrderFromRows,
  checkCanSelfRegisterMainFromRows,
  parsePosDeviceRoleLimitsRow,
  type DeviceRoleLimitCheck,
  type PosDeviceRoleLimits,
  DEFAULT_POS_DEVICE_ROLE_LIMITS,
} from '@/lib/pos-device-role-limits'

type DeviceRow = {
  device_token?: string
  role?: string
  last_seen_at?: string
}

async function listStoreDevices(storeCode: string): Promise<DeviceRow[]> {
  const s = String(storeCode || '').trim()
  if (!s) return []
  const rows = (await supabaseSelectFilter(
    'pos_connected_devices',
    `store_code=eq.${encodeURIComponent(s)}`,
    { limit: 200 }
  )) as DeviceRow[] | null
  return Array.isArray(rows) ? rows : []
}

export async function listStoreDevicesForRoleLimits(storeCode: string): Promise<DeviceRow[]> {
  return listStoreDevices(storeCode)
}

export async function getPosDeviceRoleLimits(storeCode: string): Promise<PosDeviceRoleLimits> {
  const s = String(storeCode || '').trim()
  if (!s) return { ...DEFAULT_POS_DEVICE_ROLE_LIMITS }
  try {
    const rows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(s)}`,
      { limit: 1, select: 'main_device_max_count,order_device_max_count,main_device_role_locked' }
    )) as {
      main_device_max_count?: unknown
      order_device_max_count?: unknown
      main_device_role_locked?: unknown
    }[] | null
    return parsePosDeviceRoleLimitsRow(rows?.[0])
  } catch {
    return { ...DEFAULT_POS_DEVICE_ROLE_LIMITS }
  }
}

export async function countMainDevices(storeCode: string): Promise<number> {
  const rows = await listStoreDevices(storeCode)
  return rows.filter((r) => r.role === 'main').length
}

export async function isRegisteredMainDevice(
  storeCode: string,
  deviceToken: string
): Promise<boolean> {
  const token = String(deviceToken || '').trim()
  if (!token) return false
  const rows = await listStoreDevices(storeCode)
  return rows.some((r) => String(r.device_token ?? '').trim() === token && r.role === 'main')
}

export async function assertCanAssignMain(
  storeCode: string,
  deviceToken: string,
  limits?: PosDeviceRoleLimits
): Promise<DeviceRoleLimitCheck> {
  const cfg = limits ?? (await getPosDeviceRoleLimits(storeCode))
  const rows = await listStoreDevices(storeCode)
  return checkCanAssignMainFromRows(rows, deviceToken, cfg)
}

export async function assertCanSelfRegisterMain(
  storeCode: string,
  deviceToken: string,
  limits?: PosDeviceRoleLimits
): Promise<DeviceRoleLimitCheck> {
  const cfg = limits ?? (await getPosDeviceRoleLimits(storeCode))
  const rows = await listStoreDevices(storeCode)
  return checkCanSelfRegisterMainFromRows(rows, deviceToken, cfg)
}

export async function assertCanRegisterAsOrder(
  storeCode: string,
  deviceToken: string,
  limits?: PosDeviceRoleLimits
): Promise<DeviceRoleLimitCheck> {
  const cfg = limits ?? (await getPosDeviceRoleLimits(storeCode))
  const rows = await listStoreDevices(storeCode)
  return checkCanRegisterAsOrderFromRows(rows, deviceToken, cfg)
}

/** 관리자 지정: 메인 슬롯이 찼을 때 다른 메인 기기를 주문 단말로 내림 */
export async function demoteOtherMainDevices(
  storeCode: string,
  keepDeviceToken: string
): Promise<number> {
  const s = String(storeCode || '').trim()
  const keep = String(keepDeviceToken || '').trim()
  if (!s || !keep) return 0
  const rows = await listStoreDevices(s)
  const now = new Date().toISOString()
  const others = rows.filter(
    (r) =>
      r.role === 'main' &&
      String(r.device_token ?? '').trim() !== keep &&
      String(r.device_token ?? '').trim().length > 0
  )
  if (others.length === 0) return 0
  await supabaseUpsert(
    'pos_connected_devices',
    others.map((r) => ({
      store_code: s,
      device_token: String(r.device_token ?? '').trim(),
      role: 'order',
      last_seen_at: String(r.last_seen_at ?? now),
    })),
    'store_code,device_token'
  )
  return others.length
}
