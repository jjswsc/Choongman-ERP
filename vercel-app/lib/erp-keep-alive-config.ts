/**
 * keep-alive 제외 경로 — Realtime·폴링 부담이 큰 화면만.
 * 재고·근태·급여 등 조회형 화면은 탭 전환 후에도 검색 상태를 유지한다.
 */
export const ERP_KEEP_ALIVE_EXCLUDED_PATH_PREFIXES = [
  "/admin/live-store-sales",
] as const

/**
 * 예외: 쿼리마다 keep-alive/탭 슬롯을 분리해야 하는 경로.
 * 기본은 모든 /admin 경로가 pathname만 키로 쓴다.
 */
export const ERP_KEEP_ALIVE_QUERY_SENSITIVE_PATH_PREFIXES = [] as const

/**
 * @deprecated admin 기본 pathname 키 — 호환용 예시 목록
 */
export const ERP_KEEP_ALIVE_QUERY_AGNOSTIC_PATH_PREFIXES = [
  "/admin/sales-management",
  "/admin/financial-statements",
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
  "/admin/receivable-payable",
  "/admin/petty-cash",
  "/admin/accounting-compliance",
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

/** 쿼리마다 슬롯을 나눠야 하면 true (기본 false — pathname만 키) */
export function isErpKeepAliveQuerySensitive(href: string): boolean {
  const path = normalizeErpPathOnly(href)
  return ERP_KEEP_ALIVE_QUERY_SENSITIVE_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
}

export function isErpKeepAliveQueryAgnostic(href: string): boolean {
  const path = normalizeErpPathOnly(href)
  if (!path.startsWith("/admin")) return false
  return !isErpKeepAliveQuerySensitive(path)
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

/** keep-alive Map 키 — 도움말 쿼리 제거 + (기본) pathname만 */
export function resolveErpKeepAliveCacheHref(href: string): string {
  const cleaned = stripErpHelpQueryParam(href)
  if (isErpKeepAliveQueryAgnostic(cleaned)) return normalizeErpPathOnly(cleaned)
  return cleaned
}
