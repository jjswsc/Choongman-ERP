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
