import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { moveDailyPlan, resolveDailyPlanScope } from '@/lib/daily-plan-server'

type Body = {
  fromEmployeeId?: number | string
  fromDate?: string
  toEmployeeId?: number | string
  toDate?: string
  suppressAuto?: boolean
}

/** 주간 보기 — 시작 전 하루 일정을 다른 사람·다른 날로 이동 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)

  try {
    const body = (await request.json()) as Body
    const result = await moveDailyPlan(
      {
        fromEmployeeId: Number(body.fromEmployeeId || 0),
        fromDate: String(body.fromDate || ''),
        toEmployeeId: Number(body.toEmployeeId || 0),
        toDate: String(body.toDate || ''),
        suppressAuto: body.suppressAuto !== false,
      },
      scope
    )
    if (!result.ok) {
      return NextResponse.json(
        { success: false, messageKey: result.messageKey, message: result.message },
        { status: result.status }
      )
    }
    return NextResponse.json({ success: true, planId: result.planId })
  } catch (e) {
    console.error('move-daily-plan:', e)
    return NextResponse.json({ success: false, message: '이동 실패' }, { status: 500 })
  }
}
