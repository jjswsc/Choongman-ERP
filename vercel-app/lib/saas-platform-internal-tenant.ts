/** SaaS 콘솔에서 “판매 고객”이 아닌 플랫폼 운영(본사·시드) 테넌트 */

export const SAAS_PLATFORM_INTERNAL_TENANT_IDS = ["omnifoodtech-demo"] as const

export function isSaasPlatformInternalTenantId(id: string | undefined | null): boolean {
  const t = String(id || "").trim().toLowerCase()
  if (!t) return false
  return SAAS_PLATFORM_INTERNAL_TENANT_IDS.some((x) => x.toLowerCase() === t)
}

export function isSaasPlatformInternalTenant(tenant: {
  id?: string | null
  isPlatformInternal?: boolean | null
}): boolean {
  if (tenant.isPlatformInternal === true) return true
  return isSaasPlatformInternalTenantId(tenant.id)
}
