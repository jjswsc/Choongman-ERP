import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import {
  ensureAndPublishDailyPlanTargets,
  publishDailyPlansByIds,
  resolveDailyPlanScope,
} from '@/lib/daily-plan-server'

type Body = {
  planIds?: unknown
  /** 빈 칸 포함 — { employeeId, date }[] 생성 후 공개 */
  targets?: unknown
  publish?: boolean
}

/**
 * 주간 보기 일괄 공개.
 * - planIds: 기존 미공개 일정표만 공개
 * - targets: 없으면 생성(ensure) 후 공개
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)

  try {
    const body = (await request.json()) as Body
    const publish = body.publish !== false

    const targets = (Array.isArray(body.targets) ? body.targets : [])
      .map((raw) => {
        const t = raw as { employeeId?: unknown; date?: unknown }
        return {
          employeeId: Math.floor(Number(t.employeeId) || 0),
          date: String(t.date || '').trim(),
        }
      })
      .filter((t) => t.employeeId > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date))

    if (targets.length > 0) {
      const result = await ensureAndPublishDailyPlanTargets(targets, scope, {
        publish,
        actor: scope.actorName,
      })
      return NextResponse.json({ success: true, ...result })
    }

    const planIds = (Array.isArray(body.planIds) ? body.planIds : [])
      .map((x) => Math.floor(Number(x)))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (planIds.length === 0) {
      return NextResponse.json({ success: false, message: 'planIds or targets required' }, { status: 400 })
    }
    const result = await publishDailyPlansByIds(
      planIds,
      scope,
      '📅 일정표 배정 · มีตารางงานใหม่ครับ',
      `공개 ${Math.min(planIds.length, 200)}건 요청 · เผยแพร่ตารางงานครับ`.slice(0, 180)
    )
    return NextResponse.json({ success: true, created: 0, ...result, failed: 0 })
  } catch (e) {
    console.error('publish-daily-plans:', e)
    return NextResponse.json({ success: false, message: '공개 실패' }, { status: 500 })
  }
}
