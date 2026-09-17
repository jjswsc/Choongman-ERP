/**
 * 직원 목록 화면(빨간 박스 표)과 같은 컬럼으로 CSV 보내기.
 * 관리(연필·바로가기) 열은 제외. 본사 급여 열람 권한은 표와 동일하게 적용.
 */
import { formatEmployeeDisplayName } from '@/lib/employee-display-name'
import { getEmployeeJobOptionLabel } from '@/lib/employee-job-catalog'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import {
  canViewOfficeEmployeePayroll,
  type OfficePayrollAuth,
} from '@/lib/office-payroll-access'
import { isOfficeStore } from '@/lib/permissions'
import { displayLabelShort } from '@/lib/utils'
import { downloadCsv } from '@/lib/work-log-shared'

export type EmployeeListCsvRow = {
  store?: string
  name?: string
  nameTitle?: string
  nick?: string
  employeeCode?: string
  job?: string
  nation?: string
  birth?: string
  role?: string
  join?: string
  salAmt?: number
  salType?: string
  finalGrade?: string
  managerGrade?: string
}

function isManagerRoleBadge(role: string): boolean {
  return String(role || '')
    .trim()
    .toLowerCase()
    .includes('manager')
}

function salaryTypeLabel(salType: string, t: (k: string) => string): string {
  const s = String(salType || '').trim()
  if (s === 'Monthly') return t('emp_sal_monthly')
  if (s === 'Hourly') return t('emp_sal_hourly')
  if (s === 'Part-time') return t('emp_sal_parttime')
  return s
}

export function employeeListAgeYears(birth: string, asOfYear: number): string {
  const raw = String(birth || '').trim()
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return String(asOfYear - d.getFullYear())
}

export function employeeListGradeCell(row: EmployeeListCsvRow): string {
  const grade = String(row.finalGrade || '').trim()
  const managerGrade = String(row.managerGrade || '').trim()
  const left = grade && grade !== '-' ? grade : ''
  if (!isManagerRoleBadge(String(row.role || ''))) return left
  const right = managerGrade && managerGrade !== '-' ? managerGrade : ''
  if (left && right && left !== right) return `${left} / ${right}`
  return left || right
}

export function employeeListSalaryCell(
  row: EmployeeListCsvRow,
  t: (k: string) => string,
  officePayrollAuth?: OfficePayrollAuth
): string {
  const officePayrollHidden =
    !!officePayrollAuth &&
    isOfficeStore(String(row.store || '')) &&
    !canViewOfficeEmployeePayroll(officePayrollAuth, String(row.store || ''))
  if (officePayrollHidden) return ''
  const amt = Number(row.salAmt)
  const typeLabel = salaryTypeLabel(String(row.salType || ''), t)
  const amtPart = amt > 0 ? String(amt) : ''
  return [amtPart, typeLabel].filter(Boolean).join(' ')
}

export function buildEmployeeListCsvRows(
  rows: EmployeeListCsvRow[],
  t: (k: string) => string,
  options?: { officePayrollAuth?: OfficePayrollAuth; asOfYear?: number }
): { headers: string[]; data: (string | number)[][] } {
  const asOfYear = options?.asOfYear ?? Number(getBangkokTodayDateString().slice(0, 4))
  const headers = [
    t('emp_label_store'),
    t('emp_grade'),
    t('emp_label_name'),
    t('emp_label_nickname'),
    t('emp_label_employee_code'),
    t('emp_label_job'),
    t('emp_label_nation'),
    t('emp_col_age'),
    t('emp_label_role'),
    t('emp_label_join_date'),
    t('emp_col_salary'),
  ]
  const data = rows.map((e) => [
    String(e.store || '').trim(),
    employeeListGradeCell(e),
    formatEmployeeDisplayName(String(e.name || ''), e.nameTitle) || '',
    displayLabelShort(e.nick) || '',
    String(e.employeeCode || '').trim(),
    getEmployeeJobOptionLabel(String(e.job || '').trim()) || String(e.job || '').trim(),
    String(e.nation || '').trim(),
    employeeListAgeYears(String(e.birth || ''), asOfYear),
    displayLabelShort(e.role) || String(e.role || '').trim(),
    String(e.join || '').trim().slice(0, 10),
    employeeListSalaryCell(e, t, options?.officePayrollAuth),
  ])
  return { headers, data }
}

export function downloadEmployeeListCsv(
  rows: EmployeeListCsvRow[],
  t: (k: string) => string,
  options?: { officePayrollAuth?: OfficePayrollAuth; asOfYear?: number }
): void {
  const { headers, data } = buildEmployeeListCsvRows(rows, t, options)
  const ymd = getBangkokTodayDateString()
  downloadCsv(`employees_${ymd}.csv`, headers, data)
}
