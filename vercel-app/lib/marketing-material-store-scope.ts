import {
  isAccountingRole,
  isOfficeRole,
  isSupervisorRole,
} from '@/lib/permissions'

/** 본사·회계·순회 SV — 매장별 홍보물 체크리스트 전체 조회·저장 */
export function isMarketingMaterialHqUnscopedRole(role: string): boolean {
  return (
    isOfficeRole(role) ||
    isAccountingRole(role) ||
    isSupervisorRole(role)
  )
}

/** 그 외 로그인 사용자 — 본인 매장(allowedStores)만 조회·저장 */
export function isMarketingMaterialStoreScopedRole(role: string): boolean {
  return !isMarketingMaterialHqUnscopedRole(role)
}
