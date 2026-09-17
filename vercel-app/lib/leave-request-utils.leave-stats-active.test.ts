import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/attendance-utils', () => ({
  todayStrBangkok: () => '2026-08-08',
}))

import {
  canReapplyLeaveOnSameDate,
  isEmployeeIncludedInLeaveStats,
  isLeaveDuplicateConstraintError,
  isPendingLeaveStatus,
  isRejectedLeaveStatus,
  parseLeaveStatsStaffFilter,
} from '@/lib/leave-request-utils'

describe('parseLeaveStatsStaffFilter', () => {
  it('defaults to active', () => {
    expect(parseLeaveStatsStaffFilter(null)).toBe('active')
    expect(parseLeaveStatsStaffFilter('')).toBe('active')
    expect(parseLeaveStatsStaffFilter('current')).toBe('active')
  })

  it('accepts resigned and all', () => {
    expect(parseLeaveStatsStaffFilter('resigned')).toBe('resigned')
    expect(parseLeaveStatsStaffFilter('ALL')).toBe('all')
  })
})

describe('isEmployeeIncludedInLeaveStats', () => {
  it('includes active staff and future resign dates by default', () => {
    expect(isEmployeeIncludedInLeaveStats({})).toBe(true)
    expect(isEmployeeIncludedInLeaveStats({ resign_date: null })).toBe(true)
    expect(isEmployeeIncludedInLeaveStats({ resign_date: '2026-08-09' })).toBe(true)
    expect(isEmployeeIncludedInLeaveStats({ employment_status: 'leave' })).toBe(true)
    expect(isEmployeeIncludedInLeaveStats({ employment_status: 'resigned', resign_date: '2026-08-09' })).toBe(
      true
    )
  })

  it('excludes resigned on or before Bangkok today by default', () => {
    expect(isEmployeeIncludedInLeaveStats({ resign_date: '2026-08-08' })).toBe(false)
    expect(isEmployeeIncludedInLeaveStats({ resign_date: '2026-08-07' })).toBe(false)
    expect(isEmployeeIncludedInLeaveStats({ employment_status: 'resigned' })).toBe(false)
  })

  it('includes only resigned when staffFilter is resigned', () => {
    expect(isEmployeeIncludedInLeaveStats({ resign_date: '2026-08-07' }, 'resigned')).toBe(true)
    expect(isEmployeeIncludedInLeaveStats({ resign_date: null }, 'resigned')).toBe(false)
    expect(isEmployeeIncludedInLeaveStats({ resign_date: '2026-08-09' }, 'resigned')).toBe(false)
  })

  it('includes both active and resigned when staffFilter is all', () => {
    expect(isEmployeeIncludedInLeaveStats({ resign_date: null }, 'all')).toBe(true)
    expect(isEmployeeIncludedInLeaveStats({ resign_date: '2026-08-07' }, 'all')).toBe(true)
  })

  it('excludes soft-deleted staff even without resign date', () => {
    expect(isEmployeeIncludedInLeaveStats({ deleted_at: '2026-08-01T00:00:00Z' })).toBe(false)
    expect(isEmployeeIncludedInLeaveStats({ deleted_at: '2026-08-01T00:00:00Z' }, 'all')).toBe(false)
    expect(isEmployeeIncludedInLeaveStats({ deleted_at: '2026-08-01T00:00:00Z' }, 'resigned')).toBe(false)
  })
})

describe('leave same-date unique constraint', () => {
  it('allows reapply only when rejected', () => {
    expect(isRejectedLeaveStatus('반려')).toBe(true)
    expect(isPendingLeaveStatus('대기')).toBe(true)
    expect(canReapplyLeaveOnSameDate('반려')).toBe(true)
    expect(canReapplyLeaveOnSameDate('Rejected')).toBe(true)
    expect(canReapplyLeaveOnSameDate('대기')).toBe(false)
    expect(canReapplyLeaveOnSameDate('승인')).toBe(false)
  })

  it('detects store-name-date duplicate errors', () => {
    expect(
      isLeaveDuplicateConstraintError(
        'Supabase insert failed: {"code":"23505","details":"Key (store, name, leave_date)=(1001, Parin Promvihan, 2026-09-17) already exists.","message":"duplicate key value violates unique constraint \\"leave_requests_store_name_date_key\\""}'
      )
    ).toBe(true)
    expect(isLeaveDuplicateConstraintError('duplicate key 23505 on employees_pkey')).toBe(false)
  })
})
