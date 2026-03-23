import { isAccountingRole, isFranchiseeRole, isManagerRole, isOfficeRole } from '@/lib/permissions'

/**
 * 회계·태국 신고(월마감, 부속장부, 시산 등) UI·API 사용 가능 여부.
 * 본사·회계뿐 아니라 관리자로 ERP에 들어오는 점장/가맹점주도 동일 메뉴를 쓸 수 있게 한다.
 * (로그인 정규화 역할: director, officer, manager, accounting 등)
 */
export function canManageAccountingCompliance(role: string): boolean {
  return (
    isOfficeRole(role) ||
    isAccountingRole(role) ||
    isManagerRole(role) ||
    isFranchiseeRole(role)
  )
}

export function assertCanManageAccountingCompliance(role: string): void {
  if (!canManageAccountingCompliance(role)) {
    throw new Error('ACCOUNTING_FORBIDDEN')
  }
}
