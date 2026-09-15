import { describe, expect, it, beforeEach } from 'vitest'
import {
  markAttendanceLogsMissingColumn,
  resetAttendanceLogsSchemaCompatForTests,
  shouldSkipAttendanceLogEmployeeKeyFilter,
  stripAttendanceLogSelectMissingColumns,
  noteAttendanceLogsMissingColumnFromError,
} from '@/lib/attendance-logs-schema-compat'

describe('attendance-logs-schema-compat', () => {
  beforeEach(() => {
    resetAttendanceLogsSchemaCompatForTests()
  })

  it('strips employee_id from select after the column is marked missing', () => {
    markAttendanceLogsMissingColumn('employee_id')
    expect(stripAttendanceLogSelectMissingColumns('id,log_at,log_type,employee_id,employee_code,name')).toBe(
      'id,log_at,log_type,employee_code,name'
    )
  })

  it('skips filters that reference a missing employee_id column', () => {
    markAttendanceLogsMissingColumn('employee_id')
    expect(shouldSkipAttendanceLogEmployeeKeyFilter('store_name=ilike.Office&employee_id=eq.12')).toBe(true)
    expect(shouldSkipAttendanceLogEmployeeKeyFilter('store_name=ilike.Office&name=ilike.Admin')).toBe(false)
  })

  it('notes employee_id from the Omni 42703 payload', () => {
    const err = new Error(
      'Supabase select failed: {"code":"42703","details":null,"hint":null,"message":"column attendance_logs.employee_id does not exist"}'
    )
    expect(noteAttendanceLogsMissingColumnFromError(err)).toBe('employee_id')
    expect(shouldSkipAttendanceLogEmployeeKeyFilter('employee_id=eq.1')).toBe(true)
  })
})
