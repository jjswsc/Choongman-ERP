import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { isDailyPlanCancelReason } from '@/lib/daily-plan-generate'
import { dismissDailyPlanTargets, resolveDailyPlanScope } from '@/lib/daily-plan-server'

type Body = {
  targets?: unknown
  reason?: string
  suppressAuto?: boolean
}

/** 주간 보기 — 선택한 칸 삭제(미공개) 또는 취소(공개). 진행·마감 칸은 건너뜀 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)

  try {
    const body = (await request.json()) as Body
    const reason = String(body.reason || '').trim()
    if (!isDailyPlanCancelReason(reason)) {
      return NextResponse.json(
        { success: false, messageKey: 'dp_err_cancel_reason', message: '취소 사유를 선택하세요.' },
        { status: 400 }
      )
    }
    const targets = (Array.isArray(body.targets) ? body.targets : [])
      .map((raw) => {
        const t = raw as { employeeId?: unknown; date?: unknown }
        return {
          employeeId: Math.floor(Number(t.employeeId) || 0),
          date: String(t.date || '').trim(),
        }
      })
      .filter((t) => t.employeeId > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date))
    if (targets.length === 0) {
      return NextResponse.json({ success: false, messageKey: 'dp_cancel_none', message: '삭제할 일정이 없습니다.' }, { status: 400 })
    }
    const result = await dismissDailyPlanTargets(targets, scope, {
      reason,
      suppressAuto: body.suppressAuto !== false,
      actor: scope.actorName,
    })
    if (result.schemaMissing) {
      return NextResponse.json(
        {
          success: false,
          messageKey: 'dp_err_cancel_schema',
          message: '일정 취소 컬럼이 없습니다. SQL을 먼저 실행하세요.',
          ...result,
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('dismiss-daily-plans:', e)
    return NextResponse.json({ success: false, message: '삭제 실패' }, { status: 500 })
  }
}
