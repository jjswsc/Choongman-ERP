import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { loadRoutineTemplates, resolveDailyPlanScope } from '@/lib/daily-plan-server'

/** 직급별 루틴 템플릿 목록 (항목 포함) */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  try {
    const list = await loadRoutineTemplates()
    return NextResponse.json({ success: true, list, canEdit: scope.canEditTemplates })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/routine_templates|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ success: true, list: [], canEdit: scope.canEditTemplates, notReady: true })
    }
    console.error('getRoutineTemplates:', e)
    return NextResponse.json({ success: false, message: '조회 실패', list: [] }, { status: 500 })
  }
}
