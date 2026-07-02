import { isDirectorRole, isOfficeStore } from '@/lib/permissions'

export function isEmployeeOfficePayrollManagerFlag(raw: unknown): boolean {
  return raw === true || raw === 'true' || raw === 1 || raw === '1'
}

export type OfficePayrollAuth = {
  role?: string
  canManageOfficePayroll?: boolean
}

/** Director는 담당자 지정·비상 접근. 그 외는 employees.can_manage_office_payroll 직원별 플래그 */
export function canManageOfficePayroll(auth: OfficePayrollAuth): boolean {
  if (isDirectorRole(String(auth.role || ''))) return true
  return auth.canManageOfficePayroll === true
}

export function isOfficePayrollStoreFilter(storeFilter: string): boolean {
  const x = String(storeFilter || '').trim()
  if (!x || x === 'All' || x === '전체') return false
  return isOfficeStore(x)
}

/** 급여 매장 선택 목록에서 오피스(본사) 제외 */
export function filterStoresHidingOfficePayroll(stores: string[], auth: OfficePayrollAuth): string[] {
  if (canManageOfficePayroll(auth)) return stores
  return stores.filter((s) => s === 'All' || !isOfficeStore(s))
}

/** 급여 계산·명세·급여변경 탭 매장 드롭다운 — 오피스 담당자에게 본인 매장(Office) 보강 */
export function buildPayrollStoreSelectOptions(
  storeCodes: string[],
  auth: OfficePayrollAuth & { store?: string }
): string[] {
  const merged = new Set<string>()
  for (const s of storeCodes) {
    const t = String(s || '').trim()
    if (t && t !== 'All') merged.add(t)
  }
  if (canManageOfficePayroll(auth)) {
    const userStore = String(auth.store || '').trim()
    if (userStore) merged.add(userStore)
  }
  const base = ['All', ...Array.from(merged)]
  return filterStoresHidingOfficePayroll(base, auth)
}

/** 확정 급여·계산 결과에서 오피스 직원 행 제외 */
export function filterPayrollRowsHidingOffice<T extends { store?: string }>(
  rows: T[],
  auth: OfficePayrollAuth
): T[] {
  if (canManageOfficePayroll(auth)) return rows
  return rows.filter((r) => !isOfficeStore(String(r.store || '')))
}

/** 오피스(본사) 매장 직원의 급여·계좌 정보 조회 가능 여부 */
export function canViewOfficeEmployeePayroll(auth: OfficePayrollAuth, employeeStore: string): boolean {
  if (!isOfficeStore(String(employeeStore || '').trim())) return true
  return canManageOfficePayroll(auth)
}

export type OfficeEmployeePayrollFields = {
  salType?: string
  salAmt?: number
  positionAllowance?: number
  riskAllowance?: number
  attendanceAllowance?: number
  bankName?: string
  accountNumber?: string
}

/** 비권한자에게 내려주는 오피스 직원 급여 필드 — 목록·폼에서 금액 미노출 */
export function redactedOfficeEmployeePayrollFields(): OfficeEmployeePayrollFields {
  return {
    salType: '',
    salAmt: 0,
    positionAllowance: 0,
    riskAllowance: 0,
    attendanceAllowance: 0,
    bankName: '',
    accountNumber: '',
  }
}

export function redactOfficeEmployeePayrollIfNeeded<T extends OfficeEmployeePayrollFields & { store?: string }>(
  row: T,
  auth: OfficePayrollAuth
): T {
  if (canViewOfficeEmployeePayroll(auth, String(row.store || ''))) return row
  return { ...row, ...redactedOfficeEmployeePayrollFields() }
}

/** 저장 요청 payload에서 오피스 급여 필드를 기존 DB 값으로 되돌림 */
export function preserveOfficeEmployeePayrollOnSave(
  payload: Record<string, unknown>,
  auth: OfficePayrollAuth,
  employeeStore: string,
  existing?: {
    sal_type?: unknown
    sal_amt?: unknown
    position_allowance?: unknown
    haz_allow?: unknown
    attendance_allowance?: unknown
    bank_name?: unknown
    account_number?: unknown
  } | null
): void {
  if (canViewOfficeEmployeePayroll(auth, employeeStore)) return
  const redacted = redactedOfficeEmployeePayrollFields()
  payload.sal_type = existing?.sal_type != null ? String(existing.sal_type).trim() || 'Monthly' : redacted.salType || 'Monthly'
  payload.sal_amt = existing?.sal_amt != null ? Number(existing.sal_amt) || 0 : 0
  payload.position_allowance =
    existing?.position_allowance != null ? Number(existing.position_allowance) || 0 : 0
  payload.haz_allow = existing?.haz_allow != null ? Number(existing.haz_allow) || 0 : 0
  if ('attendance_allowance' in payload) {
    payload.attendance_allowance =
      existing?.attendance_allowance != null && existing.attendance_allowance !== ''
        ? Number(existing.attendance_allowance)
        : 500
  }
  payload.bank_name = existing?.bank_name != null ? String(existing.bank_name).trim() : ''
  payload.account_number = existing?.account_number != null ? String(existing.account_number).trim() : ''
}
