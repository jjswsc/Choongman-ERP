/** POS 단말 역할 제한 — 클라이언트·서버 공통 상수·순수 함수 */

export const POS_DEVICE_RECENT_MS = 7 * 24 * 60 * 60 * 1000

export type PosDeviceRoleLimits = {
  mainDeviceMaxCount: number
  orderDeviceMaxCount: number
  mainDeviceRoleLocked: boolean
}

export const DEFAULT_POS_DEVICE_ROLE_LIMITS: PosDeviceRoleLimits = {
  mainDeviceMaxCount: 1,
  orderDeviceMaxCount: 8,
  /** 배포 직후 기존 매장: OFFICE가 켤 때까지 현장 토글 유지 */
  mainDeviceRoleLocked: false,
}

export function clampMainDeviceMaxCount(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_POS_DEVICE_ROLE_LIMITS.mainDeviceMaxCount
  return Math.min(5, Math.max(1, Math.trunc(n)))
}

export function clampOrderDeviceMaxCount(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_POS_DEVICE_ROLE_LIMITS.orderDeviceMaxCount
  return Math.min(30, Math.max(1, Math.trunc(n)))
}

export function parseMainDeviceRoleLocked(raw: unknown, fallback = false): boolean {
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false
  return fallback
}

export function parsePosDeviceRoleLimitsRow(raw: {
  main_device_max_count?: unknown
  order_device_max_count?: unknown
  main_device_role_locked?: unknown
} | null | undefined): PosDeviceRoleLimits {
  if (!raw) return { ...DEFAULT_POS_DEVICE_ROLE_LIMITS }
  return {
    mainDeviceMaxCount: clampMainDeviceMaxCount(raw.main_device_max_count),
    orderDeviceMaxCount: clampOrderDeviceMaxCount(raw.order_device_max_count),
    mainDeviceRoleLocked: parseMainDeviceRoleLocked(
      raw.main_device_role_locked,
      DEFAULT_POS_DEVICE_ROLE_LIMITS.mainDeviceRoleLocked
    ),
  }
}

type DeviceRow = {
  device_token?: string
  role?: string
  last_seen_at?: string
}

export function countMainDevicesFromRows(rows: DeviceRow[]): number {
  return rows.filter((r) => r.role === 'main').length
}

export function countRecentOrderDevicesFromRows(
  rows: DeviceRow[],
  opts?: { excludeToken?: string; recentMs?: number }
): number {
  const exclude = String(opts?.excludeToken ?? '').trim()
  const cutoff = Date.now() - (opts?.recentMs ?? POS_DEVICE_RECENT_MS)
  return rows.filter((r) => {
    if (r.role === 'attendance_display') return false
    if (r.role === 'main') return false
    const token = String(r.device_token ?? '').trim()
    if (exclude && token === exclude) return false
    const ts = new Date(String(r.last_seen_at ?? '')).getTime()
    if (Number.isNaN(ts) || ts < cutoff) return false
    return true
  }).length
}

export type DeviceRoleLimitCheck =
  | { ok: true }
  | { ok: false; message: string; code: 'MAIN_LIMIT' | 'ORDER_LIMIT' | 'ROLE_LOCKED' }

export function checkCanAssignMainFromRows(
  rows: DeviceRow[],
  deviceToken: string,
  limits: PosDeviceRoleLimits
): DeviceRoleLimitCheck {
  const token = String(deviceToken || '').trim()
  if (!token) return { ok: false, message: 'deviceToken required', code: 'MAIN_LIMIT' }
  const alreadyMain = rows.some((r) => String(r.device_token ?? '').trim() === token && r.role === 'main')
  if (alreadyMain) return { ok: true }
  const mainCount = countMainDevicesFromRows(rows)
  if (mainCount >= limits.mainDeviceMaxCount) {
    return {
      ok: false,
      code: 'MAIN_LIMIT',
      message: `메인 POS는 최대 ${limits.mainDeviceMaxCount}대까지 지정할 수 있습니다. 기존 메인을 해제한 뒤 다시 지정하세요.`,
    }
  }
  return { ok: true }
}

export function checkCanSelfRegisterMainFromRows(
  rows: DeviceRow[],
  deviceToken: string,
  limits: PosDeviceRoleLimits
): DeviceRoleLimitCheck {
  if (limits.mainDeviceRoleLocked) {
    const alreadyMain = rows.some(
      (r) => String(r.device_token ?? '').trim() === String(deviceToken || '').trim() && r.role === 'main'
    )
    if (!alreadyMain) {
      return {
        ok: false,
        code: 'ROLE_LOCKED',
        message: '단말 역할(메인/주문)은 관리자 단말 설정에서만 변경할 수 있습니다.',
      }
    }
    return { ok: true }
  }
  return checkCanAssignMainFromRows(rows, deviceToken, limits)
}

export function checkCanRegisterAsOrderFromRows(
  rows: DeviceRow[],
  deviceToken: string,
  limits: PosDeviceRoleLimits
): DeviceRoleLimitCheck {
  const token = String(deviceToken || '').trim()
  if (!token) return { ok: false, message: 'deviceToken required', code: 'ORDER_LIMIT' }
  const exists = rows.some((r) => String(r.device_token ?? '').trim() === token)
  if (exists) return { ok: true }
  const orderCount = countRecentOrderDevicesFromRows(rows)
  if (orderCount >= limits.orderDeviceMaxCount) {
    return {
      ok: false,
      code: 'ORDER_LIMIT',
      message: `주문 단말은 최대 ${limits.orderDeviceMaxCount}대까지 등록할 수 있습니다. 관리자에게 문의하세요.`,
    }
  }
  return { ok: true }
}

/** 잠금 ON: DB에 저장된 역할 유지(메인↔주문 모두 현장 변경 불가). 신규 기기는 주문 단말. */
export function resolveDeviceRoleForRegister(
  rows: DeviceRow[],
  deviceToken: string,
  clientRole: 'main' | 'order',
  limits: PosDeviceRoleLimits
): { role: 'main' | 'order'; reject?: DeviceRoleLimitCheck } {
  const token = String(deviceToken || '').trim()
  const existing = rows.find((r) => String(r.device_token ?? '').trim() === token)

  if (limits.mainDeviceRoleLocked) {
    if (existing && existing.role !== 'attendance_display') {
      return { role: existing.role === 'main' ? 'main' : 'order' }
    }
    const orderCheck = checkCanRegisterAsOrderFromRows(rows, token, limits)
    if (!orderCheck.ok) return { role: 'order', reject: orderCheck }
    return { role: 'order' }
  }

  let role: 'main' | 'order' = clientRole === 'main' ? 'main' : 'order'
  if (role === 'main') {
    const mainCheck = checkCanSelfRegisterMainFromRows(rows, token, limits)
    if (!mainCheck.ok) role = 'order'
  }
  if (role === 'order' && !existing) {
    const orderCheck = checkCanRegisterAsOrderFromRows(rows, token, limits)
    if (!orderCheck.ok) return { role: 'order', reject: orderCheck }
  }
  return { role }
}
