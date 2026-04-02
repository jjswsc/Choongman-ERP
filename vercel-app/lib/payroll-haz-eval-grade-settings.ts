import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  DEFAULT_PAYROLL_HAZ_EVAL_RULES,
  type EvalLetterGrade,
  type PayrollHazEvalGradeRules,
  parseEvalLetterGrade,
} from '@/lib/payroll-haz-eval-grade'

const KEY_REQUIRE = 'payroll_haz_require_eval_grade'
const KEY_MIN = 'payroll_haz_min_eval_grade'

function readBool(v: unknown, defaultTrue: boolean): boolean {
  if (v === false || v === 0 || v === '0') return false
  if (v === true || v === 1 || v === '1') return true
  if (typeof v === 'string' && v.toLowerCase() === 'false') return false
  return defaultTrue
}

/** system_settings에서 위험수당·평가등급 규칙 로드 (실패 시 기본값) */
export async function loadPayrollHazEvalGradeRules(): Promise<PayrollHazEvalGradeRules> {
  try {
    const orFilter = `or=(key.eq.${KEY_REQUIRE},key.eq.${KEY_MIN})`
    const rows = (await supabaseSelectFilter('system_settings', orFilter, {
      limit: 10,
    })) as { key?: string; value_json?: unknown }[] | null

    let requireEvalGrade = DEFAULT_PAYROLL_HAZ_EVAL_RULES.requireEvalGrade
    let minEvalGrade: EvalLetterGrade = DEFAULT_PAYROLL_HAZ_EVAL_RULES.minEvalGrade

    for (const r of rows || []) {
      if (r.key === KEY_REQUIRE) requireEvalGrade = readBool(r.value_json, true)
      if (r.key === KEY_MIN) {
        const p = parseEvalLetterGrade(r.value_json)
        if (p) minEvalGrade = p
      }
    }
    return { requireEvalGrade, minEvalGrade }
  } catch {
    return { ...DEFAULT_PAYROLL_HAZ_EVAL_RULES }
  }
}
