/** 클라이언트용 — /saas-admin/login 매장 기본값 (server-only 설정 미사용) */

export function isSaasAdminLoginPath(pathname: string): boolean {
  const p = (pathname || "/").replace(/\/+$/, "") || "/"
  return p === "/saas-admin/login"
}

export const SAAS_PARTNER_LOGIN_STORE_DEFAULT =
  String(process.env.NEXT_PUBLIC_SAAS_PLATFORM_PARTNER_STORE || "").trim() || "Partner"

/** SaaS 대리점 로그인 매장(Partner) — 고객사 ERP/POS 세션과 구분 */
export function isSaasPartnerLoginStoreClient(store: string): boolean {
  const s = String(store || "").trim().toLowerCase()
  const partner = SAAS_PARTNER_LOGIN_STORE_DEFAULT.trim().toLowerCase()
  return Boolean(s && partner && s === partner)
}

/** 대리점 로그인 시 회사란에는 대리점명을 입력 — 플랫폼 기본 회사명은 자동 채우지 않음 */
export function isSaasPlatformDefaultLoginCompany(company: string): boolean {
  const key = company.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  return key === "omnifoodtech" || key === "choongman"
}
