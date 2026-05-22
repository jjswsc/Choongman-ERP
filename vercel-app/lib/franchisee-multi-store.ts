import type { JwtPayload } from '@/lib/jwt-auth'
import { isFranchiseeRole } from '@/lib/permissions'
import { storeMatches } from '@/lib/admin-employee-store-access'

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
  if (!isFranchiseeRole(roleNormalized) || !settings.enabled) {
    return primary ? [primary] : []
  }
  const cap = settings.maxStores
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
