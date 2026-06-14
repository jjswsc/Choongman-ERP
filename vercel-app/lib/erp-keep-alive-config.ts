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
