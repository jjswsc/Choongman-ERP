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

/** 회계 컴플라이언스 초안/편집(작성) 가능 */
export function canWriteAccountingCompliance(role: string): boolean {
  return canManageAccountingCompliance(role)
}

/** 마감 확정/잠금 같은 고위험 확정 작업 가능 (본사 + 회계) */
export function canApproveAccountingCompliance(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

/** 잠금 해제 승인 가능 (본사 전용) */
export function canApproveAccountingPeriodUnlock(role: string): boolean {
  return isOfficeRole(role)
}

export function assertCanWriteAccountingCompliance(role: string): void {
  if (!canWriteAccountingCompliance(role)) throw new Error('ACCOUNTING_FORBIDDEN')
}

export function assertCanApproveAccountingCompliance(role: string): void {
  if (!canApproveAccountingCompliance(role)) throw new Error('ACCOUNTING_APPROVAL_FORBIDDEN')
}

export function assertCanApproveAccountingPeriodUnlock(role: string): void {
  if (!canApproveAccountingPeriodUnlock(role)) throw new Error('ACCOUNTING_UNLOCK_APPROVAL_FORBIDDEN')
}
