import { saasLoginCompanyMatches } from '@/lib/saas-login-id'
import { normalizeCompanyName, normalizeTenantId } from '@/lib/tenant-context'

export type LoginScopeEmployeeRow = {
  company?: string | null
  tenant_id?: string | null
}

/**
 * Omni 로그인 행 스코프.
 *
 * 로그인 목록(getLoginData)은 tenant_id 로 직원을 보여 주는데,
 * loginCheck 가 company 문자열만 보면 company 가 비어 있거나
 * 테넌트 슬러그인 직원은 목록에 있어도 PIN 이 맞아도 Login Failed 가 난다.
 *
 * - 테넌트가 해석되면 tenant_id 가 같은 행을 우선한다(company 공란 허용).
 * - tenant_id 가 없는 행만 company 문자열로 좁힌다.
 * - 다른 테넌트 동명이인으로는 폴백하지 않는다.
 */
export function scopeEmployeesForSaasLogin<T extends LoginScopeEmployeeRow>(
  rows: T[] | null | undefined,
  opts: { companyInput: string; tenantId?: string | null }
): T[] {
  const list = Array.isArray(rows) ? rows : []
  const companyInput = normalizeCompanyName(opts.companyInput)
  const tenantId = normalizeTenantId(opts.tenantId)

  if (tenantId) {
    const sameTenant = list.filter((r) => normalizeTenantId(r.tenant_id) === tenantId)
    if (sameTenant.length > 0) return sameTenant
    if (!companyInput) return []
    return list.filter((r) => {
      if (normalizeTenantId(r.tenant_id)) return false
      return saasLoginCompanyMatches(companyInput, normalizeCompanyName(r.company))
    })
  }

  if (!companyInput) return list
  return list.filter((r) => saasLoginCompanyMatches(companyInput, normalizeCompanyName(r.company)))
}
