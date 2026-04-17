/**
 * 직무 문자열 — 직원 평가(주방/서비스) · 급여 위험수당 단일 규칙.
 * getPayrollCalc 의 주방 판별과 동일한 정규식을 유지할 것.
 */

const KITCHEN_JOB_PAYROLL_RE = /주방|kitchen|chef|쿡|cook/i

/** 급여 위험수당: 주방 직무로 볼지 (getPayrollCalc isKitchen 과 동일) */
export function isKitchenJobForPayroll(job: string): boolean {
  return KITCHEN_JOB_PAYROLL_RE.test(String(job || '').trim())
}

export function normJobKeyForEval(job: string): string {
  return String(job || '')
    .trim()
    .toLowerCase()
}

/** 직원 평가 탭 — 주방 항목 대상 (영문 kitchen 과 정확히 일치, 대소문자 무시) */
export function matchesEvalKitchenJob(job: string): boolean {
  return normJobKeyForEval(job) === 'kitchen'
}

/** 직원 평가 탭 — 서비스 항목 대상 */
export function matchesEvalServiceJob(job: string): boolean {
  return normJobKeyForEval(job) === 'service'
}

/**
 * 저장 시: 비주방 직무이면 위험수당 일당은 DB에 0만 허용 (표시·실수 방지).
 */
export function effectiveHazardAllowanceForJob(job: string, riskAllowancePerDay: number): number {
  const n = Math.max(0, Math.floor(Number(riskAllowancePerDay) || 0))
  if (!isKitchenJobForPayroll(job)) return 0
  return n
}
