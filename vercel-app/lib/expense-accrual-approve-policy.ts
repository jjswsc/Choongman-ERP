import { isAccountingRole, isDirectorRole, isOfficeRole } from '@/lib/permissions'

/** 본사(Office·본사 등) 매장명인지 — 지출 승인 권한 분기용 */
export function isExpenseAccrualHqStoreName(storeName: string | undefined): boolean {
  const s = String(storeName || '').trim().toLowerCase()
  if (!s) return true
  return s.includes('office') || s.includes('본사') || s.includes('hq') || s.includes('오피스')
}

/**
 * 지급예정 승인·반려 가능 역할
 * - 본사(Office 등) 명의 건: 임원급(director·ceo·hr)
 * - 그 외 매장 건: 본사 권한 전체(officer 포함) + 회계 (기존에는 officer만이라 director·회계는 UI에 체크가 안 나옴)
 */
export function canApproveExpenseAccrual(userRoleRaw: string | undefined, storeName: string | undefined): boolean {
  const role = String(userRoleRaw || '')
  if (isExpenseAccrualHqStoreName(storeName)) return isDirectorRole(role)
  return isOfficeRole(role) || isAccountingRole(role)
}
