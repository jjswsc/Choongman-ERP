import {
  extractAnyMissingColumn,
  filterOrOrderReferencesColumn,
} from '@/lib/supabase-pgrst204-retry'

let missingEmployeeId = false
let missingEmployeeCode = false

export function resetAttendanceLogsSchemaCompatForTests(): void {
  missingEmployeeId = false
  missingEmployeeCode = false
}

export function attendanceLogsMissingEmployeeIdColumn(): boolean {
  return missingEmployeeId
}

export function attendanceLogsMissingEmployeeCodeColumn(): boolean {
  return missingEmployeeCode
}

export function markAttendanceLogsMissingColumn(col: string): void {
  if (col === 'employee_id') missingEmployeeId = true
  if (col === 'employee_code') missingEmployeeCode = true
}

export function noteAttendanceLogsMissingColumnFromError(err: unknown): string | null {
  const col = extractAnyMissingColumn(err)
  if (col === 'employee_id' || col === 'employee_code') {
    markAttendanceLogsMissingColumn(col)
    return col
  }
  return null
}

/** 없는 컬럼을 select에서 뺀다. */
export function stripAttendanceLogSelectMissingColumns(select: string): string {
  let parts = String(select || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (missingEmployeeId) parts = parts.filter((c) => c !== 'employee_id')
  if (missingEmployeeCode) parts = parts.filter((c) => c !== 'employee_code')
  return parts.join(',') || 'id,log_at,log_type,name'
}

/**
 * employee_id / employee_code 컬럼이 없는 DB에서 해당 키로 필터하면 42703이 난다.
 * 이름 조회로 넘기기 위해 이 필터는 건너뛴다.
 */
export function shouldSkipAttendanceLogEmployeeKeyFilter(filter: string): boolean {
  const f = String(filter || '')
  if (missingEmployeeId && filterOrOrderReferencesColumn('employee_id', f, '')) return true
  if (missingEmployeeCode && filterOrOrderReferencesColumn('employee_code', f, '')) return true
  return false
}
