/**
 * 위험수당 — 직원 평가 등급(S/A/B/C/F) 기준 (급여 계산·설정 UI 공통)
 */

export const EVAL_LETTER_GRADES = ['S', 'A', 'B', 'C', 'F'] as const
export type EvalLetterGrade = (typeof EVAL_LETTER_GRADES)[number]

/** 0 = S(최우수) … 4 = F */
export function evalLetterGradeRank(grade: string): number {
  const g = String(grade || '')
    .trim()
    .toUpperCase()
  const i = EVAL_LETTER_GRADES.indexOf(g as EvalLetterGrade)
  return i === -1 ? -1 : i
}

/**
 * 직원 등급이 최소 등급 이상인지 (동일 포함).
 * 예: min=B → S, A, B만 true. 미등록·알 수 없음(-1) → false.
 */
export function employeeMeetsMinEvalLetterGrade(employeeGrade: string, minGrade: EvalLetterGrade): boolean {
  const er = evalLetterGradeRank(employeeGrade)
  const mr = evalLetterGradeRank(minGrade)
  if (mr < 0) return true
  if (er < 0) return false
  return er <= mr
}

export type PayrollHazEvalGradeRules = {
  /** false면 주방·일당·출근일만 보고 등급 무시 */
  requireEvalGrade: boolean
  minEvalGrade: EvalLetterGrade
}

export const DEFAULT_PAYROLL_HAZ_EVAL_RULES: PayrollHazEvalGradeRules = {
  requireEvalGrade: true,
  minEvalGrade: 'B',
}

export function parseEvalLetterGrade(v: unknown): EvalLetterGrade | null {
  const s = String(v ?? '')
    .trim()
    .toUpperCase()
  if (EVAL_LETTER_GRADES.includes(s as EvalLetterGrade)) return s as EvalLetterGrade
  return null
}

/** 주방·일당·근무일 충족 시, 등급 규칙까지 반영해 위험수당 지급 여부 */
export function hazAllowEligibleWithEvalGrade(
  isKitchen: boolean,
  hazAllowPerDay: number,
  workDays: number,
  employeeGrade: string,
  rules: PayrollHazEvalGradeRules
): boolean {
  if (!isKitchen || hazAllowPerDay <= 0 || workDays <= 0) return false
  if (!rules.requireEvalGrade) return true
  return employeeMeetsMinEvalLetterGrade(employeeGrade, rules.minEvalGrade)
}
