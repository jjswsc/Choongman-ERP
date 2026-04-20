import type { JwtPayload } from '@/lib/jwt-auth'
import { userCanAccessEmployeeStore } from '@/lib/admin-employee-store-access'
import {
  isAccountingRole,
  isFranchiseeRole,
  isManagerRole,
  isOfficeRole,
} from '@/lib/permissions'

/** getWarningLettersFromEvaluations 와 동일 — 평가·경고 레지스트리 조회 가능 역할 */
export function roleMayViewEvaluation(auth: JwtPayload): boolean {
  return (
    isOfficeRole(auth.role) ||
    isAccountingRole(auth.role) ||
    isManagerRole(auth.role) ||
    isFranchiseeRole(auth.role)
  )
}

export function canViewEvaluationForStore(auth: JwtPayload, targetStore: string): boolean {
  if (!roleMayViewEvaluation(auth)) return false
  const jwtRole = String(auth.role || '')
  const jwtStore = String(auth.store || '')
  return userCanAccessEmployeeStore(jwtRole, jwtStore, targetStore, { allowedStores: auth.allowedStores })
}

/** 결재 승인·반려 — 본사·디렉터급·회계 */
export function canApproveWarningRegistry(auth: JwtPayload): boolean {
  return isOfficeRole(auth.role) || isAccountingRole(auth.role)
}
