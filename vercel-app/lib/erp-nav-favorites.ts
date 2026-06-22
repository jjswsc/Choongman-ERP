import type { AuthState } from "@/lib/auth-context"
import {
  canViewMobileStoreSales,
  isPosOrderOnlyRole,
  isPosSettlementOnlyRole,
  prefersLogisticsOperationsDashboard,
} from "@/lib/permissions"

export const ERP_NAV_FAVORITES_STORAGE_PREFIX = "erp_nav_favorites_v1"
export const ERP_NAV_FAVORITES_MAX = 8
export const ERP_NAV_DASHBOARD_QUICK_MAX = 6
export const ERP_NAV_FAVORITES_CHANGED_EVENT = "erp-nav-favorites-changed"

export type ErpNavFavoritesPayload = {
  hrefs: string[]
}

export function erpNavFavoritesStorageKey(auth: Pick<AuthState, "store" | "user" | "employeeId"> | null): string | null {
  if (!auth?.store || !auth?.user) return null
  const id = auth.employeeId != null ? String(auth.employeeId) : auth.user.trim()
  if (!id) return null
  return `${ERP_NAV_FAVORITES_STORAGE_PREFIX}:${auth.store.trim()}:${id}`
}

export function readErpNavFavoritesFromStorage(key: string | null): ErpNavFavoritesPayload | null {
  if (!key || typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
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
