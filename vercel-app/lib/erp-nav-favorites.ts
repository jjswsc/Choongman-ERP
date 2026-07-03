import type { AuthState } from "@/lib/auth-context"
import {
  canViewMobileStoreSales,
  isPosOrderOnlyRole,
  isPosSettlementOnlyRole,
  prefersLogisticsOperationsDashboard,
} from "@/lib/permissions"

export const ERP_NAV_FAVORITES_STORAGE_PREFIX = "erp_nav_favorites_v1"
export const ERP_NAV_FAVORITES_MAX = 12
export const ERP_NAV_DASHBOARD_QUICK_MAX = 6
export const ERP_NAV_FAVORITES_CHANGED_EVENT = "erp-nav-favorites-changed"

export type ErpNavFavoritesPayload = {
  hrefs: string[]
}

export function erpNavFavoritesUserId(
  auth: Pick<AuthState, "user" | "employeeId"> | null
): string | null {
  if (!auth?.user) return null
  const id = auth.employeeId != null ? String(auth.employeeId) : auth.user.trim()
  return id || null
}

/** 사용자(직원) 단위 — POS·관리자에서 매장 전환해도 동일 목록 유지 */
export function erpNavFavoritesStorageKey(
  auth: Pick<AuthState, "user" | "employeeId" | "tenantId"> | null
): string | null {
  const id = erpNavFavoritesUserId(auth)
  if (!id) return null
  const tenant = auth?.tenantId?.trim()
  if (tenant) return `${ERP_NAV_FAVORITES_STORAGE_PREFIX}:t:${tenant}:u:${id}`
  return `${ERP_NAV_FAVORITES_STORAGE_PREFIX}:u:${id}`
}

/** v1 초기: 매장별 키 — 기존 데이터 마이그레이션용 */
export function erpNavFavoritesLegacyStorageKey(
  auth: Pick<AuthState, "store" | "user" | "employeeId"> | null
): string | null {
  if (!auth?.store) return null
  const id = erpNavFavoritesUserId(auth)
  if (!id) return null
  return `${ERP_NAV_FAVORITES_STORAGE_PREFIX}:${auth.store.trim()}:${id}`
}

function parseErpNavFavoritesRaw(raw: string | null): ErpNavFavoritesPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const hrefsRaw = (parsed as { hrefs?: unknown }).hrefs
    if (!Array.isArray(hrefsRaw)) return null
    const hrefs = hrefsRaw.map((h) => String(h || "").trim()).filter(Boolean)
    return { hrefs }
  } catch {
    return null
  }
}

export function readErpNavFavoritesFromStorage(key: string | null): ErpNavFavoritesPayload | null {
  if (!key || typeof window === "undefined") return null
  return parseErpNavFavoritesRaw(localStorage.getItem(key))
}

function listErpNavFavoritesLegacyStorageKeys(userId: string): string[] {
  if (typeof window === "undefined") return []
  const keys: string[] = []
  const prefix = `${ERP_NAV_FAVORITES_STORAGE_PREFIX}:`
  const suffix = `:${userId}`
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(prefix)) continue
    if (k.includes(":u:") || k.includes(":t:")) continue
    if (!k.endsWith(suffix)) continue
    keys.push(k)
  }
  return keys
}

/** 신규 키 우선, 없으면 매장별 레거시 키에서 가장 긴 목록을 마이그레이션 */
export function readErpNavFavoritesForAuth(
  auth: Pick<AuthState, "store" | "user" | "employeeId" | "tenantId"> | null,
  storageKey: string | null
): ErpNavFavoritesPayload | null {
  const direct = readErpNavFavoritesFromStorage(storageKey)
  if (direct) return direct
  if (!auth || !storageKey || typeof window === "undefined") return null

  const candidates: ErpNavFavoritesPayload[] = []
  const legacyCurrent = erpNavFavoritesLegacyStorageKey(auth)
  const fromCurrent = readErpNavFavoritesFromStorage(legacyCurrent)
  if (fromCurrent?.hrefs.length) candidates.push(fromCurrent)

  const userId = erpNavFavoritesUserId(auth)
  if (userId) {
    for (const legacyKey of listErpNavFavoritesLegacyStorageKeys(userId)) {
      if (legacyKey === legacyCurrent) continue
      const payload = readErpNavFavoritesFromStorage(legacyKey)
      if (payload?.hrefs.length) candidates.push(payload)
    }
  }

  if (candidates.length === 0) return null
  const best = candidates.reduce((a, b) => (b.hrefs.length > a.hrefs.length ? b : a))
  writeErpNavFavoritesToStorage(storageKey, best)
  return best
}

export function writeErpNavFavoritesToStorage(key: string | null, payload: ErpNavFavoritesPayload): void {
  if (!key || typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify({ hrefs: payload.hrefs }))
    window.dispatchEvent(new CustomEvent(ERP_NAV_FAVORITES_CHANGED_EVENT))
  } catch {
    /* ignore */
  }
}

export function getDefaultErpNavFavoriteHrefs(
  role: string,
  opts?: { includeMobileStoreSales?: boolean }
): string[] {
  if (prefersLogisticsOperationsDashboard(role)) {
    return ["/admin/orders", "/admin/inbound", "/admin/outbound", "/admin/stock"]
  }
  if (isPosOrderOnlyRole(role)) {
    return ["/pos", "/admin/pos-orders", "/admin/pos-settlement"]
  }
  if (isPosSettlementOnlyRole(role)) {
    return ["/admin/pos-settlement", "/admin/pos-cash", "/admin/pos-orders"]
  }
  const hrefs = ["/admin/live-store-sales", "/admin/sales-management", "/admin/ops-center"]
  if (opts?.includeMobileStoreSales && canViewMobileStoreSales(role)) {
    hrefs.push("/store-sales")
  }
  return hrefs
}

export function sanitizeErpNavFavoriteHrefs(hrefs: string[], accessibleSet: Set<string>): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const href of hrefs) {
    const h = String(href || "").trim()
    if (!h || !accessibleSet.has(h) || seen.has(h)) continue
    seen.add(h)
    next.push(h)
    if (next.length >= ERP_NAV_FAVORITES_MAX) break
  }
  return next
}

export function resolveErpNavFavoriteHrefs(
  stored: ErpNavFavoritesPayload | null,
  role: string,
  accessibleSet: Set<string>,
  opts?: { includeMobileStoreSales?: boolean }
): { hrefs: string[]; isCustom: boolean } {
  if (stored) {
    return {
      hrefs: sanitizeErpNavFavoriteHrefs(stored.hrefs, accessibleSet),
      isCustom: true,
    }
  }
  return {
    hrefs: sanitizeErpNavFavoriteHrefs(
      getDefaultErpNavFavoriteHrefs(role, opts),
      accessibleSet
    ),
    isCustom: false,
  }
}

export function toggleErpNavFavoriteHref(current: string[], href: string): string[] {
  const h = String(href || "").trim()
  if (!h) return current
  const idx = current.indexOf(h)
  if (idx >= 0) {
    return current.filter((x) => x !== h)
  }
  if (current.length >= ERP_NAV_FAVORITES_MAX) return current
  return [h, ...current]
}

export function moveErpNavFavoriteHref(current: string[], href: string, direction: "up" | "down"): string[] {
  const idx = current.indexOf(href)
  if (idx < 0) return current
  const target = direction === "up" ? idx - 1 : idx + 1
  if (target < 0 || target >= current.length) return current
  const next = [...current]
  const [item] = next.splice(idx, 1)
  next.splice(target, 0, item)
  return next
}

export function getErpNavDashboardQuickHrefs(favoriteHrefs: string[]): string[] {
  return favoriteHrefs.slice(0, ERP_NAV_DASHBOARD_QUICK_MAX)
}
