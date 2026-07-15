import { normalizeBrandKey } from "./app-brand"

/** 대리점 관리자 /saas-admin/login — 회사명 (env로 오버라이드 가능) */
export function resolveSaasPartnerLoginCompany(): string {
  const env = String(process.env.SAAS_PLATFORM_LOGIN_COMPANY || "").trim()
  if (env) return env
  const brand = normalizeBrandKey(process.env.NEXT_PUBLIC_APP_BRAND || "")
  return brand === "omnifoodtech" ? "OmniFoodTech" : "Choongman"
}

/** 대리점 관리자 로그인 매장 (동일 매장·이름 중복 방지용 고정값) */
export function resolveSaasPartnerLoginStore(): string {
  return String(process.env.SAAS_PLATFORM_PARTNER_STORE || "").trim() || "Partner"
}

/** SaaS 대리점 로그인 매장 키인지 (일반 ERP/POS 로그인과 구분) */
export function isSaasPartnerLoginStore(store: string): boolean {
  const s = String(store || "").trim().toLowerCase()
  const partnerStore = resolveSaasPartnerLoginStore().trim().toLowerCase()
  return Boolean(s && partnerStore && s === partnerStore)
}
