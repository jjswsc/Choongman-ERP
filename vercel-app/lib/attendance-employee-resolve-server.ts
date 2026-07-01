/**
 * 근태 API — submitAttendance 와 동일한 직원 식별(employees.id·코드·이름) 해석.
 */
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { normalizeEmployeeCodeForMatch } from '@/lib/employee-display-name'

export type ResolvedAttendanceEmployee = {
  employeeId: number
  employeeName: string
  employeeCode: string
  employeeCodeNorm: string
}

export async function resolveAttendanceEmployeeIdentity(params: {
  storeName: string
  name: string
  employeeId?: number
  employeeCode?: string
}): Promise<ResolvedAttendanceEmployee> {
  const storeName = String(params.storeName || '').trim()
  let empName = String(params.name || '').trim()
  let empId =
    params.employeeId != null && Number.isFinite(Number(params.employeeId))
      ? Math.floor(Number(params.employeeId))
      : 0
  let empCodeRaw = String(params.employeeCode ?? '').trim()
  let empCodeNorm = normalizeEmployeeCodeForMatch(empCodeRaw)

  if (!storeName) {
    return { employeeId: empId, employeeName: empName, employeeCode: empCodeRaw, employeeCodeNorm: empCodeNorm }
  }

  if (empId > 0) {
    const empRows = (await supabaseSelectFilter(
      'employees',
      `id=eq.${empId}&store=ilike.${encodeURIComponent(storeName)}`,
      { limit: 1, select: 'id,name,employee_code' }
    )) as { id?: number; name?: string; employee_code?: string | null }[]
    const er = empRows?.[0]
    if (er) {
      if (String(er.name || '').trim()) empName = String(er.name || '').trim()
      const codeFromDb = String(er.employee_code ?? '').trim()
      if (codeFromDb) {
        empCodeRaw = codeFromDb
        empCodeNorm = normalizeEmployeeCodeForMatch(empCodeRaw)
      }
    }
  } else if (empName) {
    const matched = (await supabaseSelectFilter(
      'employees',
      `store=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(empName)}`,
      { limit: 5, select: 'id,name,employee_code' }
    )) as { id?: number; name?: string; employee_code?: string | null }[]
    if ((matched || []).length === 1) {
      const m = matched[0]
      const inferredId = m.id != null && Number.isFinite(Number(m.id)) ? Math.floor(Number(m.id)) : 0
      if (inferredId > 0) {
        empId = inferredId
        if (String(m.name || '').trim()) empName = String(m.name || '').trim()
        const codeFromDb = String(m.employee_code ?? '').trim()
        if (codeFromDb) {
          empCodeRaw = codeFromDb
          empCodeNorm = normalizeEmployeeCodeForMatch(empCodeRaw)
        }
      }
    }
  }

  return {
    employeeId: empId,
    employeeName: empName,
    employeeCode: empCodeRaw,
    employeeCodeNorm: empCodeNorm,
  }
}
