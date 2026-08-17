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

/** SSO 미가입·면제 인력 급여/용역 3% 원천세 (PND3). 급여 화면은 정수 바트로 운용한다. */
export const PAYROLL_WITHHOLDING_TAX_RATE = 0.03

/** 태국 근로소득(40(1)) PND1 월 원천징수 — 연간화 공제 상수 */
export const THAI_PIT_PERSONAL_ALLOWANCE_YEAR = 60_000
export const THAI_PIT_EMPLOYMENT_EXPENSE_MAX_YEAR = 100_000
export const THAI_PIT_EMPLOYMENT_EXPENSE_RATE = 0.5

/** 태국 개인소득세 누진세율 (연 과세표준, 바트) */
export const THAI_PIT_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 150_000, rate: 0 },
  { upTo: 300_000, rate: 0.05 },
  { upTo: 500_000, rate: 0.1 },
  { upTo: 750_000, rate: 0.15 },
  { upTo: 1_000_000, rate: 0.2 },
  { upTo: 2_000_000, rate: 0.25 },
  { upTo: 5_000_000, rate: 0.3 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.35 },
]

export type PayrollWithholdingTaxForm = 'PND3' | 'PND1'

export function calcThaiProgressiveIncomeTaxAnnual(annualNetTaxable: number): number {
  const base = Math.max(0, Math.floor(Number(annualNetTaxable) || 0))
  if (base <= 0) return 0
  let tax = 0
  let prev = 0
  for (const bracket of THAI_PIT_BRACKETS) {
    const cap = bracket.upTo
    const bandTop = Math.min(base, cap)
    const band = bandTop - prev
    if (band > 0) tax += band * bracket.rate
    prev = cap
    if (base <= cap) break
  }
  return tax
}

export function breakdownPayrollPnd1Withholding(
  monthlyGrossBeforeSso: number,
  monthlySsoEmployee: number
): {
  monthlyTax: number
  monthlyAssessable: number
  annualTaxableNet: number
  annualTax: number
} {
  const gross = Math.max(0, Math.floor(Number(monthlyGrossBeforeSso) || 0))
  const sso = Math.max(0, Math.floor(Number(monthlySsoEmployee) || 0))
  const monthlyAssessable = Math.max(0, gross - sso)
  const annualAssessable = monthlyAssessable * 12
  const expenseDed = Math.min(
    annualAssessable * THAI_PIT_EMPLOYMENT_EXPENSE_RATE,
    THAI_PIT_EMPLOYMENT_EXPENSE_MAX_YEAR
  )
  const annualTaxableNet = Math.max(
    0,
    annualAssessable - expenseDed - THAI_PIT_PERSONAL_ALLOWANCE_YEAR
  )
  const annualTax = calcThaiProgressiveIncomeTaxAnnual(annualTaxableNet)
  const monthlyTax = Math.round(annualTax / 12)
  return { monthlyTax, monthlyAssessable, annualTaxableNet, annualTax }
}

/** SSO 가입 근로자 PND1 월 원천징수 (40(1) 연간화·50% 경비·6만 공제·누진세 ÷12) */
export function calcPayrollWithholdingTaxPnd1Monthly(
  monthlyGrossBeforeSso: number,
  monthlySsoEmployee: number
): number {
  return breakdownPayrollPnd1Withholding(monthlyGrossBeforeSso, monthlySsoEmployee).monthlyTax
}

export function calcPayrollWithholdingTax3Percent(grossPayBeforeTax: number): number {
  const base = Math.max(0, Number(grossPayBeforeTax) || 0)
  if (base <= 0) return 0
  return Math.round(base * PAYROLL_WITHHOLDING_TAX_RATE)
}

export function resolvePayrollWithholdingTax(params: {
  ssoExempt: boolean
  monthlyGrossBeforeSso: number
  monthlySso: number
}): { tax: number; form: PayrollWithholdingTaxForm } {
  const gross = Math.max(0, Number(params.monthlyGrossBeforeSso) || 0)
  if (params.ssoExempt) {
    return { tax: calcPayrollWithholdingTax3Percent(gross), form: 'PND3' }
  }
  const sso = Math.max(0, Number(params.monthlySso) || 0)
  return {
    tax: calcPayrollWithholdingTaxPnd1Monthly(gross, sso),
    form: 'PND1',
  }
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

/**
 * 입사·퇴사일과 급여 귀속 기간 [periodStart, periodEnd]가 하루라도 겹치면 true.
 * 입사일 없음 → 과거부터 재직. 퇴사일 없음 → 재직 중.
 */
export function isEmployeeActiveInPayrollPeriod(
  joinYmd: string,
  resignYmd: string,
  periodStart: string,
  periodEnd: string
): boolean {
  const j = joinYmd || '1900-01-01'
  const r = resignYmd || '9999-12-31'
  if (j > periodEnd) return false
  if (r < periodStart) return false
  return true
}

/**
 * 급여 계산 명단 포함 여부.
 * 퇴사일이 귀속월 이전이어도 해당 월 근태·스케줄 실적이 있으면 포함(익월 정산·퇴사일 보정).
 */
export function isEmployeePayrollEligibleForMonth(params: {
  joinYmd: string
  resignYmd: string
  periodStart: string
  periodEnd: string
  hasAttendanceInMonth: boolean
  hasScheduleInMonth: boolean
}): boolean {
  const { joinYmd, resignYmd, periodStart, periodEnd, hasAttendanceInMonth, hasScheduleInMonth } =
    params
  if (joinYmd && joinYmd > periodEnd) return false
  if (isEmployeeActiveInPayrollPeriod(joinYmd, resignYmd, periodStart, periodEnd)) return true
  return hasAttendanceInMonth || hasScheduleInMonth
}

/** 급여 실지급일 — 귀속월 근태 합산 후 익월 이 날 */
export const PAYROLL_PAY_DAY_OF_MONTH = 5

/** 익월 지급이 주말·공휴일로 밀려도 같은 귀속월로 보는 말일(1~15일) */
export const PAYROLL_PAY_WINDOW_LAST_DAY = 15

export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const m = String(yearMonth || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(m)) return ''
  const [y, mo] = m.split('-').map(Number)
  const total = y * 12 + (mo - 1) + deltaMonths
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/** 방콕 기준 YYYY-MM — 매월 5일 지급·전월 1일~말일 산정 시 기본 귀속월(전월) */
export function defaultPayrollAttributionMonthBangkok(now = new Date()): string {
  const cur = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7)
  return shiftYearMonth(cur, -1)
}

/** 귀속월 YYYY-MM → 실제 지급일(익월 5일). 예: 2026-07 → 2026-08-05 */
export function payrollPayYmdFromAttributionMonth(monthStr: string): string {
  const next = shiftYearMonth(monthStr, 1)
  if (!next) return ''
  return `${next}-${String(PAYROLL_PAY_DAY_OF_MONTH).padStart(2, '0')}`
}

/** 지급일 → 근태 귀속월. 예: 2026-08-05 → 2026-07 (1~15일은 전월, 그 이후는 당월) */
export function payrollAttributionMonthFromPayYmd(ymd: string): string {
  const d = String(ymd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return ''
  const month = d.slice(0, 7)
  const day = Number(d.slice(8, 10))
  if (!Number.isFinite(day) || day < 1) return ''
  if (day <= PAYROLL_PAY_WINDOW_LAST_DAY) return shiftYearMonth(month, -1)
  return month
}

export function isPayrollOrSsoExpensePayeeCode(payeeCode: string | null | undefined): boolean {
  const c = String(payeeCode || '').trim().toLowerCase()
  return c.startsWith('payroll-') || c.startsWith('sso-')
}

/** 급여·SSO 지급예정 연결 시 통장 expense_date = 발생일(귀속월), 지급일이 아님 */
export function bankExpenseDateWhenPayingPayrollAccrual(
  payeeCode: string | null | undefined,
  accrualExpenseDate: string | null | undefined,
  paymentDate: string
): string {
  const pay = String(paymentDate || '').slice(0, 10)
  const exp = String(accrualExpenseDate || '').slice(0, 10)
  if (isPayrollOrSsoExpensePayeeCode(payeeCode) && /^\d{4}-\d{2}-\d{2}$/.test(exp)) return exp
  return /^\d{4}-\d{2}-\d{2}$/.test(pay) ? pay : exp
}

/** 손익 조회월 말일 → 익월 지급창 말일(15일). 7/31 → 8/15 */
export function plFetchEndStrWithPayrollPayWindow(plEndStr: string): string {
  const end = String(plEndStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return end
  const next = shiftYearMonth(end.slice(0, 7), 1)
  if (!next) return end
  return `${next}-${String(PAYROLL_PAY_WINDOW_LAST_DAY).padStart(2, '0')}`
}
