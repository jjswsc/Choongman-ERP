import {
  attendanceBusinessDayBoundsMs,
  segmentOverlapsAttendanceBusinessDay,
} from '@/lib/attendance-utils'

/**
 * 당일 방문 현황에 넣을지.
 *
 * 근무일 창(D 00:00 ~ D+1 08:00)과 겹치면 표시한다.
 * 시작 시각의 근태 근무일(00:00~07:59 → 전날)로 자르면,
 * 아침 일찍 시작한 진행 중 방문이 08:00 이후 "오늘" 화면에서 사라진다.
 */
export function visitSegmentVisibleOnBusinessDay(
  startMs: number,
  endMs: number | null,
  ongoing: boolean,
  businessDateYmd: string,
  nowMs: number
): boolean {
  const { startMs: winStart, endMsExclusive: winEndEx } = attendanceBusinessDayBoundsMs(businessDateYmd)
  return segmentOverlapsAttendanceBusinessDay(startMs, endMs, ongoing, winStart, winEndEx, nowMs)
}
