import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import {
  canViewRoutineTemplate,
  loadRoutineTemplates,
  resolveDailyPlanScope,
} from '@/lib/daily-plan-server'

/** 직급별 루틴 템플릿 목록 (항목 포함). 매장 매니저는 자기 매장 manager/staff만. */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  try {
    const all = await loadRoutineTemplates()
    const list = all.filter((t) =>
      canViewRoutineTemplate(scope, {
        roleScope: t.roleScope,
        storeName: t.storeName,
        employeeId: t.employeeId,
      })
    )
    return NextResponse.json({
      success: true,
      list,
      canEdit: scope.canEditTemplates,
      canCopy: scope.canCopyTemplates,
      storeLeadOnly: scope.storeLead && !scope.office && !scope.supervisor,
      allowedStores: scope.storeLead && !scope.office ? scope.stores : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/routine_templates|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({
        success: true,
        list: [],
        canEdit: scope.canEditTemplates,
        canCopy: scope.canCopyTemplates,
        notReady: true,
      })
    }
    console.error('getRoutineTemplates:', e)
    return NextResponse.json({ success: false, message: '조회 실패', list: [] }, { status: 500 })
  }
}
