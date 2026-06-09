import type { JwtPayload } from '@/lib/jwt-auth'
import { isFranchiseeRole, isSupervisorRole } from '@/lib/permissions'
import { storeMatches } from '@/lib/admin-employee-store-access'
import { filterPosSalesStoreOptionsForManagement } from '@/lib/pos-sales-test-office'

/** ERP 헤더·대시보드: 허용 매장 전체 합산(본사 「전체 매장」과 UI 값만 동일, 범위는 JWT allowedStores) */
export const FRANCHISEE_AGGREGATE_ALL_STORES_VALUE = 'All'

export const FRANCHISEE_MULTI_STORE_SETTINGS_KEY = 'franchisee_multi_store'

export type FranchiseeMultiStoreSettings = {
  enabled: boolean
  maxStores: number
}

const DEFAULT_SETTINGS: FranchiseeMultiStoreSettings = {
  enabled: false,
  maxStores: 5,
}

function clampMaxStores(n: number): number {
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SETTINGS.maxStores
  return Math.min(20, Math.max(1, Math.floor(n)))
}

export function normalizeFranchiseeMultiStoreSettings(raw: unknown): FranchiseeMultiStoreSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const o = raw as { enabled?: unknown; maxStores?: unknown }
  const enabled = o.enabled === true
  const maxStores = clampMaxStores(Number(o.maxStores))
  return { enabled, maxStores: enabled ? maxStores : DEFAULT_SETTINGS.maxStores }
}

export { parseExtraStoresColumn } from '@/lib/extra-stores-column'

/** JWT에 넣을 허용 매장 목록 (대표 store + extra, 중복 제거) */
export function buildAllowedStoresForToken(
  primaryStore: string,
  extraStores: string[],
  settings: FranchiseeMultiStoreSettings,
  roleNormalized: string
): string[] {
  const primary = String(primaryStore || '').trim()
  const cap = isSupervisorRole(roleNormalized) ? 20 : settings.maxStores
  const mergeStores = (): string[] => {
    const out: string[] = []
    const seen = new Set<string>()
    const push = (s: string) => {
      const x = String(s || '').trim()
      if (!x || seen.has(x)) return
      if (out.length >= cap) return
      seen.add(x)
      out.push(x)
    }
    push(primary)
    for (const e of extraStores) push(e)
    return out
  }
  if (isSupervisorRole(roleNormalized)) {
    return mergeStores()
  }
  if (!isFranchiseeRole(roleNormalized) || !settings.enabled) {
    return primary ? [primary] : []
  }
  return mergeStores()
}

/** JWT allowedStores — 가맹점주·슈퍼바이저 직원 조회/수정 범위 */
export function employeeScopeAllowedStoresFromJwt(jwt: JwtPayload | null): string[] | undefined {
  if (!jwt) return undefined
  const role = String(jwt.role || '')
  if (!isFranchiseeRole(role) && !isSupervisorRole(role)) return undefined
  const list = normalizedAllowedStoresFromJwt(jwt)
  return list.length > 0 ? list : undefined
}

/** JWT 페이로드에서 허용 매장 정규화 */
export function normalizedAllowedStoresFromJwt(jwt: JwtPayload | null): string[] {
  if (!jwt) return []
  const primary = String(jwt.store || '').trim()
  const extra = Array.isArray(jwt.allowedStores)
    ? jwt.allowedStores.map((x) => String(x || '').trim()).filter(Boolean)
    : []
  const set = new Set<string>()
  if (primary) set.add(primary)
  for (const x of extra) set.add(x)
  return [...set]
}

/** 가맹점주가 쿼리/바디로 보낸 userStore가 JWT 범위 안인지 */
export function franchiseeQueryStoreAllowed(jwt: JwtPayload | null, queryUserStore: string): boolean {
  if (!jwt || !isFranchiseeRole(jwt.role)) return true
  const q = String(queryUserStore || '').trim()
  if (!q) return false
  const list = normalizedAllowedStoresFromJwt(jwt)
  if (list.length === 0) return false
  return list.some((s) => storeMatches(s, q))
}

export type FranchiseeSalesScopeAuth = {
  role?: string
  store?: string
  allowedStores?: string[]
}

/** 복수 허용 매장 가맹점주 — 허용 매장 합산 조회 */
export function canFranchiseeAggregateAllowedStores(
  role: string | undefined,
  allowedStores?: string[] | null,
  primaryStore?: string | null
): boolean {
  if (!isFranchiseeRole(role || '')) return false
  const set = new Set<string>()
  const primary = String(primaryStore || '').trim()
  if (primary) set.add(primary)
  for (const x of allowedStores || []) {
    const s = String(x || '').trim()
    if (s) set.add(s)
  }
  return set.size > 1
}

export function isFranchiseeAggregateAllStoresView(viewStore: string | null | undefined): boolean {
  const v = String(viewStore || '').trim()
  return !v || v === FRANCHISEE_AGGREGATE_ALL_STORES_VALUE || v === '전체'
}

/** POS 매출·대시보드용 허용 매장 코드(테스트·본사 POS 제외) */
export function franchiseePosSalesStoreChoices(auth: FranchiseeSalesScopeAuth | null): string[] {
  if (!auth || !isFranchiseeRole(auth.role || '')) return []
  const primary = String(auth.store || '').trim()
  const extra = Array.isArray(auth.allowedStores)
    ? auth.allowedStores.map((x) => String(x || '').trim()).filter(Boolean)
    : []
  const set = new Set<string>()
  if (primary) set.add(primary)
  for (const x of extra) set.add(x)
  return filterPosSalesStoreOptionsForManagement([...set])
}

/** 가맹 허용 매장 중 요청 코드만(미일치 제거). 빈 요청이면 허용 전체 */
export function pickFranchiseePosSalesStoreCodes(
  auth: FranchiseeSalesScopeAuth | null,
  requested: string[]
): string[] {
  const allowed = franchiseePosSalesStoreChoices(auth)
  if (allowed.length === 0) return []
  const req = requested.map((s) => String(s || '').trim()).filter(Boolean)
  if (req.length === 0) return allowed
  const picked = req.filter((s) => allowed.some((a) => storeMatches(a, s)))
  return picked.length > 0 ? picked : allowed
}

/** UI viewStore → API stores 파라미터(가맹 All은 undefined가 아니라 명시 배열) */
export function resolveFranchiseePosSalesFetchStoreCodes(
  auth: FranchiseeSalesScopeAuth | null,
  viewStore: string | null | undefined
): string[] {
  const allowed = franchiseePosSalesStoreChoices(auth)
  if (allowed.length === 0) {
    const one = String(auth?.store || '').trim()
    return one ? [one] : []
  }
  if (isFranchiseeAggregateAllStoresView(viewStore)) return allowed
  const v = String(viewStore || auth?.store || '').trim()
  if (!v) return allowed
  const hit = allowed.find((a) => storeMatches(a, v))
  return hit ? [hit] : pickFranchiseePosSalesStoreCodes(auth, [v])
}

export function rowRoleLooksFranchisee(roleRaw: string): boolean {
  const r = String(roleRaw || '').toLowerCase()
  return r.includes('franchisee') || r.includes('가맹') || r.includes('점주')
}

/** employees.extra_stores 저장용 (대표 매장 제외, maxStores는 대표 포함 상한) */
export function normalizeFranchiseeExtraStores(
  primaryStore: string,
  rawExtra: unknown,
  maxStoresInclPrimary: number
): string[] {
  const primary = String(primaryStore || '').trim()
  const arr = Array.isArray(rawExtra) ? rawExtra : []
  const seen = new Set<string>()
  const extras: string[] = []
  const maxExtra = Math.max(0, maxStoresInclPrimary - 1)
  for (const x of arr) {
    const s = String(x || '').trim()
    if (!s || s === primary || seen.has(s)) continue
    seen.add(s)
    extras.push(s)
    if (extras.length >= maxExtra) break
  }
  return extras
}
