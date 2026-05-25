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

/** สปส.1-10: 임금이 이 금액 미만이면 산정 기준을 1,650바트로 (0원은 0 유지) */
export const SSO_MIN_CONTRIBUTION_WAGE_THB = 1650

/** 연도별 SSO 한도 (태국) — พ.ศ. 2569~2571 → 17,500 / 875 (2026~2028) 등 */
export function getSSOLimitsByYear(year: number): { ceiling: number; maxDed: number } {
  const y = year
  if (y <= 2025) return { ceiling: 15000, maxDed: 750 }
  if (y <= 2028) return { ceiling: 17500, maxDed: 875 }
  if (y <= 2031) return { ceiling: 20000, maxDed: 1000 }
  return { ceiling: 23000, maxDed: 1150 }
}

/** สปส.: สตางค์ 50 이상 올림, 미만 버림 */
export function roundSsoContributionBaht(amountBaht: number): number {
  const n = Math.max(0, Number(amountBaht) || 0)
  const whole = Math.floor(n)
  const frac = n - whole
  if (frac >= 0.5) return whole + 1
  return whole
}

/** 상·하한 적용 후 5% 산정에 쓰는 기준 임금(바트, 정수) */
export function ssoContributableWageBaht(rawWage: number, year: number): number {
  const base = Math.max(0, Math.floor(Number(rawWage) || 0))
  if (base === 0) return 0
  const { ceiling } = getSSOLimitsByYear(year)
  const withFloor = Math.max(SSO_MIN_CONTRIBUTION_WAGE_THB, base)
  return Math.min(withFloor, ceiling)
}

/** e-Service ค่าจ้างที่จ่ายจริง 열 표시 방식 */
export type SsoFilingWageMode = 'contributable' | 'gross' | 'basic'

export function resolveSsoFilingWageBaht(
  row: Record<string, unknown>,
  mode: SsoFilingWageMode
): number {
  if (mode === 'basic') {
    return Math.max(0, Math.floor(Number(row.ssoBase) || 0))
  }
  if (mode === 'gross') {
    return Math.max(0, Math.floor(Number(row.ssoGrossWage) || 0))
  }
  return Math.max(0, Math.floor(Number(row.ssoContributableWage) || 0))
}

/**
 * SSO 산정 기준 임금총액(음수는 0).
 * 기본급 + 직책·위험·근면 수당 등 + 생일·공휴일 가산 + OT − 지각·조퇴 − 무급결석/무급휴가 공제 (SSO 본인 부담금 적용 전).
 */
export function grossWageBeforeSSO(params: {
  salary: number
  posAllow: number
  hazAllow: number
  diligenceAllow?: number
  birthBonus: number
  holidayPay: number
  otAmt: number
  lateDed: number
  earlyDed: number
  unpaidAbsenceDed?: number
}): number {
  const u = params.unpaidAbsenceDed ?? 0
  const d = params.diligenceAllow ?? 0
  const raw =
    params.salary +
    params.posAllow +
    params.hazAllow +
    d +
    params.birthBonus +
    params.holidayPay +
    params.otAmt -
    params.lateDed -
    params.earlyDed -
    u
  return Math.max(0, raw)
}

/**
 * 태국 SSO 본인부담 산정 기준액(기본급만, 수당·OT·지각공제 등 제외).
 * - 월급제: 인사 등록 월 기본급 `sal_amt`
 * - 시급제: 해당 월 지급 기본급(근무시간×시급, OT 제외)
 */
/** DB/폼의 sso_exempt 값을 boolean으로 */
export function isEmployeeSsoExemptFlag(raw: unknown): boolean {
  return raw === true || raw === 'true' || raw === 1 || raw === '1'
}

/** SSO 미가입·면제 인력 급여/용역 3% 원천세. 급여 화면은 정수 바트로 운용한다. */
export const PAYROLL_WITHHOLDING_TAX_RATE = 0.03

export function calcPayrollWithholdingTax3Percent(grossPayBeforeTax: number): number {
  const base = Math.max(0, Number(grossPayBeforeTax) || 0)
  if (base <= 0) return 0
  return Math.round(base * PAYROLL_WITHHOLDING_TAX_RATE)
}

export function ssoContributionBaseWage(isHourly: boolean, salAmt: number, hourlyMonthBaseSalary: number): number {
  if (isHourly) return Math.max(0, Math.floor(Number(hourlyMonthBaseSalary) || 0))
  return Math.max(0, Math.floor(Number(salAmt) || 0))
}

/** SSO 공제액: 기준임금 → 1,650 하한·연도 상한 → 5% → 50 satang 반올림 → maxDed 캡 */
export function calcSSO(contributionBase: number, year: number): number {
  const contributable = ssoContributableWageBaht(contributionBase, year)
  if (contributable === 0) return 0
  const { maxDed } = getSSOLimitsByYear(year)
  const raw = contributable * 0.05
  return Math.min(roundSsoContributionBaht(raw), maxDed)
}
