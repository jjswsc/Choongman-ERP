import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_PENDING_BADGE_LOOKBACK_DAYS,
  attendancePendingApprovalPostgrestFilter,
} from '@/lib/attendance-utils'
import {
  LEAVE_PENDING_BADGE_LOOKBACK_DAYS,
  attendancePendingBadgePostgrestFilter,
  leavePendingApprovalPostgrestFilter,
} from '@/lib/admin-pending-badge-filters'

describe('attendancePendingApprovalPostgrestFilter', () => {
  it('승인 대기 핵심 조건(지각·연장·조퇴·특수 status)을 포함한다', () => {
    const q = attendancePendingApprovalPostgrestFilter()
    expect(q).toContain('approved.eq.' + encodeURIComponent('대기'))
    expect(q).toContain('late_min.gt.0')
    expect(q).toContain('ot_min.gt.0')
    expect(q).toContain('early_min.gt.0')
  })

  it('lookbackDays 미지정 시 log_at 기간 필터 없음', () => {
    const q = attendancePendingApprovalPostgrestFilter()
    expect(q).not.toContain('log_at=gte.')
  })

  it('lookbackDays 지정 시 log_at 구간 필터를 붙인다', () => {
    const q = attendancePendingApprovalPostgrestFilter(undefined, { lookbackDays: 30 })
    expect(q).toContain('log_at=gte.')
    expect(q).toContain('log_at=lt.')
    expect(q).toContain('and=(approved.eq.')
  })

  it('actionRequiredStatusOnly면 지각·연장·조퇴 분을 빼고 status만', () => {
    const q = attendancePendingApprovalPostgrestFilter(undefined, {
      actionRequiredStatusOnly: true,
    })
    expect(q).not.toContain('late_min.gt.0')
    expect(q).not.toContain('ot_min.gt.0')
    expect(q).not.toContain('early_min.gt.0')
    expect(q).toContain('status.like.')
    expect(q).toContain('approved.eq.' + encodeURIComponent('대기'))
  })
})

describe('attendancePendingBadgePostgrestFilter', () => {
  it('배지용 30일 lookback + status 승인대기만 사용한다', () => {
    expect(ATTENDANCE_PENDING_BADGE_LOOKBACK_DAYS).toBe(30)
    const badge = attendancePendingBadgePostgrestFilter()
    const explicit = attendancePendingApprovalPostgrestFilter(undefined, {
      lookbackDays: ATTENDANCE_PENDING_BADGE_LOOKBACK_DAYS,
      actionRequiredStatusOnly: true,
    })
    expect(badge).toBe(explicit)
  })
})

describe('leavePendingApprovalPostgrestFilter', () => {
  it('대기/Pending + 최근 leave_date 하한을 포함한다', () => {
    expect(LEAVE_PENDING_BADGE_LOOKBACK_DAYS).toBe(30)
    const q = leavePendingApprovalPostgrestFilter()
    expect(q).toContain('status.eq.' + encodeURIComponent('대기'))
    expect(q).toContain('status.eq.Pending')
    expect(q).toContain('leave_date=gte.')
  })
})
