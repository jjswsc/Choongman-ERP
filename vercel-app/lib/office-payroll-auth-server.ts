import { supabaseSelectFilter } from '@/lib/supabase-server'
import type { JwtPayload } from '@/lib/jwt-auth'
import {
  canManageOfficePayroll,
  isEmployeeOfficePayrollManagerFlag,
  type OfficePayrollAuth,
} from '@/lib/office-payroll-access'

/** JWT·역할만으로 부족할 때 employees.can_manage_office_payroll DB 재확인 */
export async function resolveCanManageOfficePayrollAuth(
  auth: OfficePayrollAuth & Pick<JwtPayload, 'employeeId'>
): Promise<OfficePayrollAuth & { canManageOfficePayroll: boolean }> {
  if (canManageOfficePayroll(auth)) {
    return { ...auth, canManageOfficePayroll: true }
  }
  const empId = auth.employeeId != null ? Math.floor(Number(auth.employeeId)) : 0
  if (empId <= 0) {
    return { ...auth, canManageOfficePayroll: false }
  }
  try {
    const rows = (await supabaseSelectFilter('employees', `id=eq.${empId}`, {
      limit: 1,
      select: 'can_manage_office_payroll',
    })) as { can_manage_office_payroll?: unknown }[]
    const fromDb = isEmployeeOfficePayrollManagerFlag(rows?.[0]?.can_manage_office_payroll)
    return { ...auth, canManageOfficePayroll: fromDb }
  } catch {
    return { ...auth, canManageOfficePayroll: false }
  }
}
