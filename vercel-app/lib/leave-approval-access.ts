/**
 * 휴가 승인 권한 — 전체 승인자 / 매장 승인자 / (미설정 매장) 레거시 폴백
 */
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  isDirectorRole,
  isNativeOfficeRole,
  isOfficeStore,
} from '@/lib/permissions'

export type LeaveApproverScope = 'all' | 'store'

export type LeaveApproverRow = {
  employeeId: number
  scope: LeaveApproverScope
  store: string | null
}

export type LeaveApprovalAuth = {
  role?: string
  store?: string
  employeeId?: number | null
  allowedStores?: string[] | null
}

/** Director급·본사 네이티브 role·오피스 소속만 승인자 목록 편집 */
export function canEditLeaveApprovers(auth: { role?: string; store?: string }): boolean {
  const role = String(auth.role || '')
  if (isDirectorRole(role) || isNativeOfficeRole(role)) return true
  return isOfficeStore(String(auth.store || ''))
}

export function normalizeLeaveApproverScope(raw: unknown): LeaveApproverScope | null {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
  if (s === 'all') return 'all'
  if (s === 'store') return 'store'
  return null
}

export function isLeaveGlobalApprover(employeeId: number, rows: LeaveApproverRow[]): boolean {
  if (!(employeeId > 0)) return false
  return rows.some((r) => r.scope === 'all' && r.employeeId === employeeId)
}

export function storeHasLeaveApprovers(targetStore: string, rows: LeaveApproverRow[]): boolean {
  const t = String(targetStore || '').trim()
  if (!t) return false
  return rows.some(
    (r) => r.scope === 'store' && r.store && storesMatchForGradeLookup(r.store, t)
  )
}

export function isLeaveStoreApprover(
  employeeId: number,
  targetStore: string,
  rows: LeaveApproverRow[]
): boolean {
  if (!(employeeId > 0)) return false
  const t = String(targetStore || '').trim()
  if (!t) return false
  return rows.some(
    (r) =>
      r.scope === 'store' &&
      r.employeeId === employeeId &&
      r.store &&
      storesMatchForGradeLookup(r.store, t)
  )
}

function allowedStoresOf(auth: LeaveApprovalAuth): string[] {
  const userStore = String(auth.store || '').trim()
  const fromJwt = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  return [...fromJwt, ...(userStore ? [userStore] : [])]
}

/** processLeaveApproval 레거시: manager/franchisee 문자열 → 자기 매장만, 그 외(본사 등) → 제한 없음 */
export function canApproveLeaveLegacy(auth: LeaveApprovalAuth, targetStore: string): boolean {
  const userRole = String(auth.role || '').toLowerCase()
  const isManagerLike = userRole.includes('manager') || userRole.includes('franchisee')
  const target = String(targetStore || '').trim()
  if (!isManagerLike) return true
  if (!target) return false
  return allowedStoresOf(auth).some((s) => storesMatchForGradeLookup(s, target))
}

/**
 * 특정 매장 휴가 승인·반려·삭제 가능 여부.
 * - Director: 항상
 * - 전체 승인자: 항상
 * - 해당 매장에 매장 승인자 1명+ : 목록에 있을 때만
 * - 미설정 매장: 레거시(점장/가맹점주 자기 매장, 본사급은 전체)
 */
export function canApproveLeaveForStore(
  auth: LeaveApprovalAuth,
  targetStore: string,
  rows: LeaveApproverRow[]
): boolean {
  if (isDirectorRole(String(auth.role || ''))) return true
  const eid =
    auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
      ? Math.floor(Number(auth.employeeId))
      : 0
  if (eid > 0 && isLeaveGlobalApprover(eid, rows)) return true
  const target = String(targetStore || '').trim()
  if (!target) return false
  if (storeHasLeaveApprovers(target, rows)) {
    return isLeaveStoreApprover(eid, target, rows)
  }
  return canApproveLeaveLegacy(auth, target)
}

export type LeaveApprovalListScope =
  | { mode: 'all' }
  | { mode: 'stores'; stores: string[] }
  | { mode: 'none' }

/**
 * 휴가 대기 목록 조회 스코프.
 * Director·전체 승인자 → 전체.
 * 그 외 → 지정된 매장 ∪ (미설정 매장에 대한 레거시 허용 매장).
 * `knownStores` 가 있으면 미설정 매장 판별에 사용; 없으면 store 행에 나온 매장만 "설정됨"으로 본다.
 */
export function resolveLeaveApprovalListScope(
  auth: LeaveApprovalAuth,
  rows: LeaveApproverRow[],
  knownStores?: string[]
): LeaveApprovalListScope {
  if (isDirectorRole(String(auth.role || ''))) return { mode: 'all' }
  const eid =
    auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
      ? Math.floor(Number(auth.employeeId))
      : 0
  if (eid > 0 && isLeaveGlobalApprover(eid, rows)) return { mode: 'all' }

  const configuredStoreKeys = new Set<string>()
  for (const r of rows) {
    if (r.scope !== 'store' || !r.store) continue
    configuredStoreKeys.add(String(r.store).trim())
  }

  const allowed = new Set<string>()
  for (const r of rows) {
    if (r.scope === 'store' && r.employeeId === eid && r.store) {
      allowed.add(String(r.store).trim())
    }
  }

  const probeStores =
    knownStores && knownStores.length > 0
      ? knownStores.map((s) => String(s || '').trim()).filter(Boolean)
      : Array.from(configuredStoreKeys)

  const isStoreConfigured = (store: string) =>
    Array.from(configuredStoreKeys).some((c) => storesMatchForGradeLookup(c, store))

  const userRole = String(auth.role || '').toLowerCase()
  const isManagerLike = userRole.includes('manager') || userRole.includes('franchisee')

  if (isManagerLike) {
    for (const s of allowedStoresOf(auth)) {
      if (!isStoreConfigured(s)) allowed.add(s)
    }
  } else {
    // 본사·회계·SV 등: 미설정 매장은 전부처럼 전부
    const unconfigured = probeStores.filter((s) => !isStoreConfigured(s))
    if (unconfigured.length === 0 && configuredStoreKeys.size === 0) {
      return { mode: 'all' }
    }
    if (probeStores.length === 0 && configuredStoreKeys.size === 0) {
      return { mode: 'all' }
    }
    for (const s of unconfigured) allowed.add(s)
    if (knownStores && knownStores.length > 0) {
      const allConfigured = knownStores.every((s) => isStoreConfigured(s))
      if (!allConfigured) {
        for (const s of knownStores) {
          const t = String(s || '').trim()
          if (t && !isStoreConfigured(t)) allowed.add(t)
        }
      }
    } else if (configuredStoreKeys.size === 0) {
      return { mode: 'all' }
    }
  }

  const stores = Array.from(allowed).filter(Boolean)
  if (stores.length === 0) return { mode: 'none' }
  return { mode: 'stores', stores }
}

/** 목록 행이 현재 스코프에 포함되는지 */
export function leaveStoreInListScope(
  store: string,
  scope: LeaveApprovalListScope
): boolean {
  if (scope.mode === 'all') return true
  if (scope.mode === 'none') return false
  const t = String(store || '').trim()
  if (!t) return false
  return scope.stores.some((s) => storesMatchForGradeLookup(s, t))
}
