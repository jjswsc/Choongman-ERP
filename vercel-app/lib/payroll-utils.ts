/**
 * 급여 계산 유틸 (태국 SSO 등)
 * 테스트 가능하도록 순수 함수로 분리
 */

/**
 * 근무일·근무시간 집계 시 해당 퇴근 로그를 인정할지.
 * submitAttendance 는 GPS 통과 후에도 approved 를 '대기'로 저장하므로,
 * 승인/승인완료 외에도 '위치미확인·승인대기'가 아니고 반려가 아니면 인정한다.
 */
/** 급여·연장 수당: 이 미만(분)은 미인정 — 근태 화면·submitAttendance 연장(30분) 기준과 동일 */
export const OT_PAYROLL_MIN_MINUTES = 30

export function otMinutesForPayroll(otMinRaw: unknown): number {
  const n = Math.floor(Number(otMinRaw) || 0)
  return n >= OT_PAYROLL_MIN_MINUTES ? n : 0
}

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

/**
 * SSO 산정 기준 임금총액(음수는 0).
 * 기본급 + 직책·위험 수당 등 + 생일·공휴일 가산 + OT − 지각·조퇴 − 무급결석/무급휴가 공제 (SSO 본인 부담금 적용 전).
 */
export function grossWageBeforeSSO(params: {
  salary: number
  posAllow: number
  hazAllow: number
  birthBonus: number
  holidayPay: number
  otAmt: number
  lateDed: number
  earlyDed: number
  unpaidAbsenceDed?: number
}): number {
  const u = params.unpaidAbsenceDed ?? 0
  const raw =
    params.salary +
    params.posAllow +
    params.hazAllow +
    params.birthBonus +
    params.holidayPay +
    params.otAmt -
    params.lateDed -
    params.earlyDed -
    u
  return Math.max(0, raw)
}

/** SSO 공제액: grossWageBeforeSSO 결과(또는 동일 의미의 산정액)의 5%, ceiling·maxDed 한도 */
export function calcSSO(grossForContribution: number, year: number): number {
  const { ceiling, maxDed } = getSSOLimitsByYear(year)
  const contributable = Math.min(grossForContribution, ceiling)
  return Math.min(Math.floor(contributable * 0.05), maxDed)
}
