import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { loadPayrollHazEvalGradeRules } from '@/lib/payroll-haz-eval-grade-settings'
import { DEFAULT_PAYROLL_HAZ_EVAL_RULES, EVAL_LETTER_GRADES, parseEvalLetterGrade } from '@/lib/payroll-haz-eval-grade'

const KEY_REQUIRE = 'payroll_haz_require_eval_grade'
const KEY_MIN = 'payroll_haz_min_eval_grade'

function canEditPayrollRules(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

/** GET: 위험수당·평가등급 규칙 (급여 메뉴 열람 권한) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse

  try {
    const rules = await loadPayrollHazEvalGradeRules()
    return NextResponse.json(
      {
        requireEvalGrade: rules.requireEvalGrade,
        minEvalGrade: rules.minEvalGrade,
        gradeOptions: [...EVAL_LETTER_GRADES],
        canEdit: canEditPayrollRules(authResult.auth.role || ''),
      },
      { headers }
    )
  } catch (e) {
    console.error('payrollHazGradeRules GET:', e)
    return NextResponse.json(
      {
        requireEvalGrade: DEFAULT_PAYROLL_HAZ_EVAL_RULES.requireEvalGrade,
        minEvalGrade: DEFAULT_PAYROLL_HAZ_EVAL_RULES.minEvalGrade,
        gradeOptions: [...EVAL_LETTER_GRADES],
        canEdit: false,
      },
      { headers }
    )
  }
}

/** POST: 규칙 저장 (본사·회계) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  if (!canEditPayrollRules(authResult.auth.role || '')) {
    return NextResponse.json({ success: false, message: '본사 또는 회계 권한이 필요합니다.' }, { status: 403, headers })
  }

  try {
    const body = (await req.json()) as { requireEvalGrade?: unknown; minEvalGrade?: unknown }
    const requireEvalGrade = !(
      body.requireEvalGrade === false ||
      body.requireEvalGrade === 'false' ||
      body.requireEvalGrade === 0
    )

    const minParsed = parseEvalLetterGrade(body.minEvalGrade)
    const minEvalGrade = minParsed ?? DEFAULT_PAYROLL_HAZ_EVAL_RULES.minEvalGrade

    const now = new Date().toISOString()
    await supabaseUpsert(
      'system_settings',
      [
        { key: KEY_REQUIRE, value_json: requireEvalGrade, updated_at: now },
        { key: KEY_MIN, value_json: minEvalGrade, updated_at: now },
      ],
      'key'
    )
    return NextResponse.json({ success: true, requireEvalGrade, minEvalGrade }, { headers })
  } catch (e) {
    console.error('payrollHazGradeRules POST:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
