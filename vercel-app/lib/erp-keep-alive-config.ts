/**
 * keep-alive 제외 경로 — 메모리·백그라운드 부담이 큰 화면.
 * 방문 후 다른 메뉴로 나가면 unmount(기존 Next 동작), 돌아올 때 새로 로드.
 */
export const ERP_KEEP_ALIVE_EXCLUDED_PATH_PREFIXES = [
  "/admin/live-store-sales",
  "/admin/pos-menus",
  "/admin/inbound",
  "/admin/marketing/campaigns",
  "/admin/interior",
] as const

/**
 * 쿼리(?menu=&topic=&stores= 등)마다 keep-alive 캐시가 갈라지면
 * router.replace 시 이전·다음 URL 슬롯이 번갈아 보이며 화면이 깜박일 수 있다.
 * 매출 관리처럼 필터를 URL에 두는 화면은 pathname만 캐시 키로 쓴다.
 */
export const ERP_KEEP_ALIVE_QUERY_AGNOSTIC_PATH_PREFIXES = [
  "/admin/sales-management",
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

/** keep-alive Map 키 — 쿼리 무시 대상은 pathname만 사용 */
export function resolveErpKeepAliveCacheHref(href: string): string {
  if (isErpKeepAliveQueryAgnostic(href)) return normalizeErpPathOnly(href)
  return href
}
