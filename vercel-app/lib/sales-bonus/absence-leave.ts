/**
 * 매출 보너스 결근 패널티 — 면제(제외) 휴가.
 * 주 6일 근무 + 1일 휴식: 휴식일은 스케줄(plan_in/out)이 없으면 애초에 결근 대상이 아님.
 * 승인 휴가 중 아래만 결근에서 제외. 그 외(무단·무급 등)는 패널티.
 */
const EXCUSED_LEAVE_RE =
  /연차|반차|병가|휴가|annual|half|sick|leave|ลากิจ|lakij|ลาป่วย|พักร้อน/i

const UNPAID_LEAVE_RE = /무급|unpaid/i

/** 병가·연차/반차/휴가·ลากิจ 등 — 결근 패널티에서 제외 */
export function isSalesBonusExcusedLeaveType(type: string | null | undefined): boolean {
  const t = String(type || '').trim()
  if (!t) return false
  if (UNPAID_LEAVE_RE.test(t)) return false
  return EXCUSED_LEAVE_RE.test(t)
}
