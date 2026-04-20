import type { JwtPayload } from '@/lib/jwt-auth'
import {
  canApproveWarningRegistry,
  canViewEvaluationForStore,
  roleMayViewEvaluation,
} from '@/lib/warning-letter-evaluation-access'
import { isFranchiseeRole, isManagerRole, isOfficeRole } from '@/lib/permissions'

export type RegistryRowLite = {
  store_name: string
  approval_status?: string
  created_by?: string | null
}

export function canReadRegistry(auth: JwtPayload): boolean {
  return roleMayViewEvaluation(auth)
}

export function canCreateRegistryForStore(auth: JwtPayload, storeName: string): boolean {
  if (!roleMayViewEvaluation(auth)) return false
  const s = String(storeName || '').trim()
  if (!s) return false
  return canViewEvaluationForStore(auth, s)
}

/** 초안·결재중 내용만 수정 가능(승인·반려 후 잠금) */
export function canEditRegistryContent(auth: JwtPayload, row: RegistryRowLite): boolean {
  if (!canViewEvaluationForStore(auth, row.store_name)) return false
  const st = String(row.approval_status ?? '')
  if (st === 'approved' || st === 'rejected') return false
  const u = String(auth.name || '').trim()
  if (canApproveWarningRegistry(auth)) return st === 'draft' || st === 'pending'
  if (st !== 'draft' && st !== 'pending') return false
  if (row.created_by && u && row.created_by === u) return true
  return isOfficeRole(auth.role) || isManagerRole(auth.role) || isFranchiseeRole(auth.role)
}

export function canDeleteRegistryRow(auth: JwtPayload, row: RegistryRowLite): boolean {
  if (!canViewEvaluationForStore(auth, row.store_name)) return false
  if (String(row.approval_status) !== 'draft') return false
  if (canApproveWarningRegistry(auth)) return true
  const u = String(auth.name || '').trim()
  return Boolean(row.created_by && u && row.created_by === u)
}

export function canSubmitRegistry(auth: JwtPayload, row: RegistryRowLite): boolean {
  if (String(row.approval_status) !== 'draft') return false
  return canEditRegistryContent(auth, row)
}

export function canRejectOrApprove(auth: JwtPayload): boolean {
  return canApproveWarningRegistry(auth)
}

/** 반려 → 초안으로 되돌려 재상신 */
export function canReopenRegistryToDraft(auth: JwtPayload, row: RegistryRowLite): boolean {
  if (String(row.approval_status) !== 'rejected') return false
  if (!canViewEvaluationForStore(auth, row.store_name)) return false
  if (canApproveWarningRegistry(auth)) return true
  const u = String(auth.name || '').trim()
  if (row.created_by && u && row.created_by === u) return true
  return isOfficeRole(auth.role) || isManagerRole(auth.role) || isFranchiseeRole(auth.role)
}
