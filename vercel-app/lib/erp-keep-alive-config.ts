/**
 * keep-alive 제외 경로 — 메모리·백그라운드 부담이 큰 화면.
 * 방문 후 다른 메뉴로 나가면 unmount(기존 Next 동작), 돌아올 때 새로 로드.
 */
export const ERP_KEEP_ALIVE_EXCLUDED_PATH_PREFIXES = [
  "/admin/live-store-sales",
  "/admin/pos-menus",
  "/admin/pos-orders",
  "/admin/pos-printers",
  "/admin/inbound",
  "/admin/outbound",
  "/admin/stock",
  "/admin/attendance",
  "/admin/payroll",
  "/admin/marketing/campaigns",
  "/admin/marketing/materials",
  "/admin/crm/member-app",
  "/admin/interior",
] as const

/**
 * 쿼리(?tab=&menu= 등)마다 탭·keep-alive 슬롯이 갈라지지 않도록 pathname만 키로 쓴다.
 * (필터·내부 탭 상태를 URL에 두는 화면)
 */
export const ERP_KEEP_ALIVE_QUERY_AGNOSTIC_PATH_PREFIXES = [
  "/admin/sales-management",
  "/admin/tax-filing",
  "/admin/leave",
  "/admin/expense-management",
  "/admin/bank-transactions",
  "/admin/work-log",
  "/admin/notices",
  "/admin/company-documents",
  "/admin/crm/coupons",
  "/admin/members",
  "/admin/members/visits",
  "/admin/pos-cost-analysis",
  "/admin/pos-screen-config",
  "/admin/marketing/report",
  "/admin/order-create",
  "/admin/accounting/purchase-order",
  "/admin/vendors",
] as const

export function normalizeErpPathOnly(href: string): string {
  const raw = (href || "").trim()
  if (!raw) return ""
  const q = raw.indexOf("?")
  const path = q >= 0 ? raw.slice(0, q) : raw
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1)
  return path
}

export function isErpKeepAliveExcluded(href: string): boolean {
  const path = normalizeErpPathOnly(href)
  if (!path.startsWith("/admin")) return true
  return ERP_KEEP_ALIVE_EXCLUDED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
}

export function isErpKeepAliveQueryAgnostic(href: string): boolean {
  const path = normalizeErpPathOnly(href)
  return ERP_KEEP_ALIVE_QUERY_AGNOSTIC_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
}

/** keep-alive / 탭 공통 — 도움말 모드 쿼리는 캐시·탭 키에서 제외 */
export function stripErpHelpQueryParam(href: string): string {
  const raw = (href || "").trim()
  if (!raw) return ""
  const q = raw.indexOf("?")
  if (q < 0) return raw
  const path = raw.slice(0, q)
  const params = new URLSearchParams(raw.slice(q + 1))
  if (!params.has("erp_help")) return raw
  params.delete("erp_help")
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** keep-alive Map 키 — 도움말 쿼리 제거 + 쿼리 무시 대상은 pathname만 */
export function resolveErpKeepAliveCacheHref(href: string): string {
  const cleaned = stripErpHelpQueryParam(href)
  if (isErpKeepAliveQueryAgnostic(cleaned)) return normalizeErpPathOnly(cleaned)
  return cleaned
}
