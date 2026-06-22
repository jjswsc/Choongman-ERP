/**
 * ERP 사이드바·대시보드 배지용 PostgREST 필터 — 실제 처리(승인·조치)가 필요한 건만 COUNT.
 * UI 목록 API(getAttendanceRecordsAdmin, getLeavePendingList 등)와 의미를 맞춘다.
 */

import {
  ATTENDANCE_PENDING_BADGE_LOOKBACK_DAYS,
  attendancePendingApprovalPostgrestFilter,
} from '@/lib/attendance-utils'

/** 미승인 발주 — orders.status=Pending 만 (Hold·Approved·Rejected 제외) */
export function ordersPendingApprovalPostgrestFilter(): string {
  return 'status=eq.Pending'
}

/** 휴가 승인 대기 — 한글·영문 status 혼용 DB 대응 (동일 행 이중 집계 없음) */
export function leavePendingApprovalPostgrestFilter(): string {
  return `or=(status.eq.${encodeURIComponent('대기')},status.eq.Pending)`
}

/** 근태 승인 대기 — approved=대기 전체가 아니라 지각·연장·조퇴·GPS·강제퇴근 등만 */
export { attendancePendingApprovalPostgrestFilter, ATTENDANCE_PENDING_BADGE_LOOKBACK_DAYS }

/** 사이드바·대시보드 배지 — 최근 N일(방콕, 오늘 포함) 승인 대기만 */
export function attendancePendingBadgePostgrestFilter(): string {
  return attendancePendingApprovalPostgrestFilter(undefined, {
    lookbackDays: ATTENDANCE_PENDING_BADGE_LOOKBACK_DAYS,
  })
}
