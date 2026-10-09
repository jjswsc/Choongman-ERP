import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { canViewDailyPlan, closeDailyPlan, getDailyPlanById, resolveDailyPlanScope } from '@/lib/daily-plan-server'

/** 일정표 마감 — 합계 계산, 업무일지 요약 1행 기록, 미완료 과제 다음 날 이월 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  try {
    const body = (await request.json()) as { planId?: number | string }
    const plan = await getDailyPlanById(Number(body.planId || 0))
    if (!plan) return NextResponse.json({ success: false, message: 'not found' }, { status: 404 })
    if (!canViewDailyPlan(scope, plan)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 })
    }
    if (plan.status === 'closed') {
      return NextResponse.json({ success: false, messageKey: 'dp_err_closed', message: '이미 마감되었습니다.' }, { status: 409 })
    }
    const result = await closeDailyPlan(plan, { actor: scope.actorName || 'self' })
    return NextResponse.json({ success: true, result })
  } catch (e) {
    console.error('closeDailyPlan:', e)
    return NextResponse.json({ success: false, message: '마감 실패' }, { status: 500 })
  }
}
