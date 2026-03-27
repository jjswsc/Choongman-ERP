/**
 * 급여 계산 유틸 (태국 SSO 등)
 * 테스트 가능하도록 순수 함수로 분리
 */

/**
 * 근무일·근무시간 집계 시 해당 퇴근 로그를 인정할지.
 * submitAttendance 는 GPS 통과 후에도 approved 를 '대기'로 저장하므로,
 * 승인/승인완료 외에도 '위치미확인·승인대기'가 아니고 반려가 아니면 인정한다.
 */
export function clockOutCountsForPayroll(approvedRaw: unknown, statusRaw: unknown): boolean {
  const approved = String(approvedRaw || '').trim()
  const status = String(statusRaw || '').trim()
  if (approved === '반려' || status === '반려') return false
  if (approved === '승인' || approved === '승인완료') return true
  if (/위치미확인|승인대기/.test(status)) return false
  return true
}

/** 연도별 SSO 한도 (태국) */
export function getSSOLimitsByYear(year: number): { ceiling: number; maxDed: number } {
  const y = year
  if (y <= 2025) return { ceiling: 15000, maxDed: 750 }
  if (y <= 2028) return { ceiling: 17500, maxDed: 875 }
  if (y <= 2031) return { ceiling: 20000, maxDed: 1000 }
  return { ceiling: 23000, maxDed: 1150 }
}

/** SSO 공제액 계산 (급여의 5%, ceiling·maxDed 한도 적용 - getPayrollCalc와 동일 로직) */
export function calcSSO(grossSalary: number, year: number): number {
  const { ceiling, maxDed } = getSSOLimitsByYear(year)
  const contributable = Math.min(grossSalary, ceiling)
  return Math.min(Math.floor(contributable * 0.05), maxDed)
}
