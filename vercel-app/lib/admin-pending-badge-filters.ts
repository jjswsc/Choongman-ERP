/**
 * ERP 사이드바·대시보드 배지용 PostgREST 필터 — 실제 처리(승인·조치)가 필요한 건만 COUNT.
 * 배지는 「아직 아무도 승인하지 않은」 건만 세고, 목록 API(지각·연장 조정 등)보다 좁을 수 있다.
 */

import {
  ATTENDANCE_PENDING_BADGE_LOOKBACK_DAYS,
  addDayBangkok,
  attendancePendingApprovalPostgrestFilter,
  todayStrBangkok,
} from '@/lib/attendance-utils'

/** 휴가 배지 — 휴가일 기준 최근 N일(오늘 포함) + 이후(미래 신청) */
export const LEAVE_PENDING_BADGE_LOOKBACK_DAYS = 30

/** 미승인 발주 — orders.status=Pending 만 (Hold·Approved·Rejected 제외) */
export function ordersPendingApprovalPostgrestFilter(): string {
  return 'status=eq.Pending'
}

/**
 * 휴가 승인 대기 — 한글·영문 status 혼용 DB 대응.
 * 오래된 과거 휴가일 대기는 배지에서 제외(최근 N일~미래만).
 */
export function leavePendingApprovalPostgrestFilter(): string {
  const statusPart = `or=(status.eq.${encodeURIComponent('대기')},status.eq.Pending)`
  const endYmd = todayStrBangkok()
  const startYmd = addDayBangkok(endYmd, -(LEAVE_PENDING_BADGE_LOOKBACK_DAYS - 1))
  return `${statusPart}&leave_date=gte.${encodeURIComponent(startYmd)}`
}

/** 근태 승인 대기 — approved=대기 전체가 아니라 지각·연장·조퇴·GPS·강제퇴근 등만 */
export { attendancePendingApprovalPostgrestFilter, ATTENDANCE_PENDING_BADGE_LOOKBACK_DAYS }

/**
 * 사이드바·대시보드 근태 배지 — 최근 N일 + status 승인대기(GPS·강제퇴근 등)만.
 * 지각·연장·조퇴 분만 있는 건은 매장에서 일괄 안 눌러도 배지가 수천으로 불어나지 않게 제외.
 */
export function attendancePendingBadgePostgrestFilter(): string {
  return attendancePendingApprovalPostgrestFilter(undefined, {
    lookbackDays: ATTENDANCE_PENDING_BADGE_LOOKBACK_DAYS,
    actionRequiredStatusOnly: true,
  })
}
