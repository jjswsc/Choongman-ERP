/** 클라이언트용 — /saas-admin/login 매장 기본값 (server-only 모듈 미사용) */

export function isSaasAdminLoginPath(pathname: string): boolean {
  const p = (pathname || "/").replace(/\/+$/, "") || "/"
  return p === "/saas-admin/login"
}

export const SAAS_PARTNER_LOGIN_STORE_DEFAULT =
  String(process.env.NEXT_PUBLIC_SAAS_PLATFORM_PARTNER_STORE || "").trim() || "Partner"

/** 대리점 로그인 시 회사란에는 대리점명을 입력 — 플랫폼 기본 회사명은 자동 채우지 않음 */
export function isSaasPlatformDefaultLoginCompany(company: string): boolean {
  const key = company.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  return key === "omnifoodtech" || key === "choongman"
}
