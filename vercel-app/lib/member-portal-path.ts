/** 회원 라운지 PWA(/m/*) — ERP Serwist SW·자동 갱신 대상에서 제외 */
export function isMemberPortalPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname === "/m" || pathname.startsWith("/m/")
}
