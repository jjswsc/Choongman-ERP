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

/** 지급예정 수정·삭제 API 호출 가능(본사 + 회계). 매장별 승인 세부는 canApprove / canDelete 참고 */
export function canMutateExpenseAccrualRecord(userRoleRaw: string | undefined): boolean {
  const role = String(userRoleRaw || '')
  return isOfficeRole(role) || isAccountingRole(role)
}

/**
 * 지급 상태상 삭제 가능 여부
 * - 매장 미선택: 정리용으로 허용
 * - planned / rejected / approved 이면서 미지급·통장/패티 미연결
 * - paid / done / partial 이어도 **실제 지급액·연결이 없으면** 오표시 정리용으로 허용
 * - 지급액>0 또는 통장/패티 연결 있으면 차단
 */
export function isExpenseAccrualDeletableByPaymentState(input: {
  status?: string
  paidAmount?: number
  hasPaymentLink?: boolean
  isNoStore?: boolean
}): boolean {
  if (input.isNoStore) return true
  if (input.hasPaymentLink) return false
  const paid = Math.max(0, Number(input.paidAmount) || 0)
  if (paid > 0.005) return false
  const status = String(input.status || '').toLowerCase()
  return (
    status === 'planned' ||
    status === 'rejected' ||
    status === 'approved' ||
    status === 'partial' ||
    status === 'paid' ||
    status === 'done'
  )
}

/**
 * 지급예정 삭제 권한
 * - 매장 미선택: 본사·회계
 * - 그 외: 해당 건 승인 가능 역할과 동일 + 지급 상태 가드
 */
export function canDeleteExpenseAccrual(input: {
  userRole?: string
  storeName?: string
  status?: string
  paidAmount?: number
  hasPaymentLink?: boolean
}): boolean {
  const role = String(input.userRole || '')
  const isNoStore = !String(input.storeName || '').trim()
  if (!canMutateExpenseAccrualRecord(role)) return false
  if (isNoStore) return true
  if (!canApproveExpenseAccrual(role, input.storeName)) return false
  return isExpenseAccrualDeletableByPaymentState({
    status: input.status,
    paidAmount: input.paidAmount,
    hasPaymentLink: input.hasPaymentLink,
    isNoStore: false,
  })
}

/** 지급예정·지출등록 수정 가능 여부 (승인 후·미지급 포함, 지급 시작 후 차단) */
export function canEditExpenseAccrualPlan(input: {
  status?: string
  paidAmount?: number
}): boolean {
  const status = String(input.status || '').toLowerCase()
  if (status === 'paid' || status === 'done') return false
  const paid = Math.max(0, Number(input.paidAmount) || 0)
  if (paid > 0.005) return false
  return status === 'planned' || status === 'approved' || status === 'rejected'
}

/**
 * 계정과목·유형·지급처·메모 등 분류 수정 — 지급 완료 후에도 허용
 * (금액·일자는 API에서 잠금)
 */
export function canEditExpenseAccrualClassification(input: {
  status?: string
}): boolean {
  const status = String(input.status || '').toLowerCase()
  return (
    status === 'planned' ||
    status === 'approved' ||
    status === 'rejected' ||
    status === 'partial' ||
    status === 'paid' ||
    status === 'done'
  )
}
