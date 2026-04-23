import { supabaseSelectFilter } from '@/lib/supabase-server'
import { userCanAccessEmployeeStore, storeMatches } from '@/lib/admin-employee-store-access'
import { isOfficeRole } from '@/lib/permissions'
import { normalizedAllowedStoresFromJwt } from '@/lib/franchisee-multi-store'
import type { JwtPayload } from '@/lib/jwt-auth'

export async function validateCompanyHybridRelated(
  relatedType: string,
  relatedId: string,
  store: string,
  role: string,
  userStore: string,
  jwt: JwtPayload
): Promise<string | null> {
  if (relatedType === 'none') {
    if (relatedId) return '연결 없음일 때는 관련 ID를 비우세요.'
    return null
  }
  if (!relatedId) return '관련 유형이 있으면 관련 ID를 입력하세요.'

  if (relatedType === 'employee') {
    const n = Number(relatedId)
    if (!Number.isFinite(n) || n <= 0) return '직원 ID는 양의 숫자여야 합니다.'
    const rows = (await supabaseSelectFilter(
      'employees',
      `id=eq.${n}`,
      { limit: 1, select: 'id,store' }
    )) as { id?: number; store?: string }[] | null
    const emp = rows?.[0]
    if (!emp) return '해당 직원을 찾을 수 없습니다.'
    if (!storeMatches(String(emp.store || ''), store) && !isOfficeRole(role)) {
      return '문서 매장과 직원 소속이 일치하지 않습니다.'
    }
    const allow = userCanAccessEmployeeStore(role, userStore, String(emp.store || ''), {
      allowedStores: normalizedAllowedStoresFromJwt(jwt),
    })
    if (!allow) return '해당 직원에 대한 접근 권한이 없습니다.'
    return null
  }
  if (relatedType === 'interior_project') {
    const n = Number(relatedId)
    if (!Number.isFinite(n) || n <= 0) return '인테리어 프로젝트 ID는 양의 숫자여야 합니다.'
    const rows = (await supabaseSelectFilter(
      'interior_projects',
      `id=eq.${n}`,
      { limit: 1, select: 'id' }
    )) as { id?: number }[] | null
    if (!rows?.[0]) return '인테리어 프로젝트를 찾을 수 없습니다.'
    return null
  }
  if (relatedType === 'store') {
    if (relatedId.length < 1) return '매장 식별값을 입력하세요.'
    return null
  }
  return '알 수 없는 관련 유형입니다.'
}
