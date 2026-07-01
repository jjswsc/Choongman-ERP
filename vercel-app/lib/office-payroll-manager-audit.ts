import { isDirectorRole, isOfficeStore } from '@/lib/permissions'
import { isEmployeeOfficePayrollManagerFlag } from '@/lib/office-payroll-access'

export type OfficePayrollManagerAuditRow = {
  id: number
  employeeCode: string
  name: string
  store: string
  role: string
  job: string
  resignDate: string
  employmentStatus: string
  /** 배포 전 구버전 로그인·세션 버그 영향 가능 (재로그인·화면 새로고침 권장) */
  needsSessionRefresh: boolean
  risks: string[]
}

type EmpAuditInput = {
  id?: number | null
  employee_code?: string | null
  name?: string | null
  store?: string | null
  role?: string | null
  job?: string | null
  resign_date?: string | null
  employment_status?: string | null
  can_manage_office_payroll?: unknown
  deleted_at?: string | null
}

function normName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isResignedRow(r: EmpAuditInput): boolean {
  const status = String(r.employment_status || '')
    .trim()
    .toLowerCase()
  if (status === 'resigned' || status === '퇴사') return true
  const resign = String(r.resign_date || '').trim().slice(0, 10)
  if (!resign) return false
  const today = new Date().toISOString().slice(0, 10)
  return today > resign
}

/** DB 직원 목록에서 오피스 급여 담당자 감사 */
export function auditOfficePayrollManagers(rows: EmpAuditInput[]): {
  managers: OfficePayrollManagerAuditRow[]
  duplicateNameGroups: { name: string; count: number; stores: string[] }[]
  summary: {
    totalFlagged: number
    activeFlagged: number
    resignedButFlagged: number
    duplicateNameRisk: number
    nonDirectorNeedingFlag: number
  }
} {
  const activeRows = (rows || []).filter((r) => !String(r.deleted_at || '').trim())
  const flagged = activeRows.filter((r) => isEmployeeOfficePayrollManagerFlag(r.can_manage_office_payroll))

  const nameCounts = new Map<string, { count: number; stores: Set<string> }>()
  for (const r of activeRows) {
    const n = normName(String(r.name || ''))
    if (!n) continue
    const cur = nameCounts.get(n) || { count: 0, stores: new Set<string>() }
    cur.count += 1
    const st = String(r.store || '').trim()
    if (st) cur.stores.add(st)
    nameCounts.set(n, cur)
  }

  const duplicateNameGroups = Array.from(nameCounts.entries())
    .filter(([, v]) => v.count > 1)
    .map(([name, v]) => ({
      name,
      count: v.count,
      stores: Array.from(v.stores).sort(),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const duplicateNames = new Set(duplicateNameGroups.map((g) => g.name))

  const managers: OfficePayrollManagerAuditRow[] = flagged.map((r) => {
    const id = Math.floor(Number(r.id) || 0)
    const name = String(r.name || '').trim()
    const store = String(r.store || '').trim()
    const role = String(r.role || '').trim()
    const job = String(r.job || '').trim()
    const employeeCode = String(r.employee_code || '').trim()
    const resigned = isResignedRow(r)
    const risks: string[] = []
    const n = normName(name)

    if (resigned) risks.push('resigned_but_flagged')
    if (duplicateNames.has(n)) risks.push('duplicate_name_login_risk')
    if (!employeeCode) risks.push('missing_employee_code')
    if (!isOfficeStore(store)) risks.push('non_office_store')
    if (!isDirectorRole(role)) risks.push('relies_on_employee_flag')

    const needsSessionRefresh =
      !resigned && !isDirectorRole(role) && risks.includes('relies_on_employee_flag')

    return {
      id,
      employeeCode,
      name,
      store,
      role,
      job,
      resignDate: String(r.resign_date || '').trim().slice(0, 10),
      employmentStatus: String(r.employment_status || '').trim(),
      needsSessionRefresh,
      risks,
    }
  })

  managers.sort((a, b) => a.store.localeCompare(b.store, 'ko') || a.name.localeCompare(b.name, 'ko'))

  const activeFlagged = managers.filter((m) => !m.risks.includes('resigned_but_flagged'))

  return {
    managers,
    duplicateNameGroups,
    summary: {
      totalFlagged: managers.length,
      activeFlagged: activeFlagged.length,
      resignedButFlagged: managers.filter((m) => m.risks.includes('resigned_but_flagged')).length,
      duplicateNameRisk: managers.filter((m) => m.risks.includes('duplicate_name_login_risk')).length,
      nonDirectorNeedingFlag: managers.filter((m) => m.risks.includes('relies_on_employee_flag')).length,
    },
  }
}
