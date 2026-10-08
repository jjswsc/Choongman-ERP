import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { addDaysYmdUtc, summarizePlanItems } from '@/lib/daily-plan-generate'
import {
  canViewDailyPlan,
  ensureDailyPlanOnDemand,
  getDailyPlanById,
  getDailyPlanFor,
  getDailyPlanItems,
  loadPlanEmployeeById,
  normalizePlanRow,
  planItemLite,
  resolveDailyPlanScope,
  type DailyPlanRow,
} from '@/lib/daily-plan-server'

const YMD = /^\d{4}-\d{2}-\d{2}$/

async function findOwnPlan(date: string, employeeId: number | null, name: string): Promise<DailyPlanRow | null> {
  if (employeeId) return getDailyPlanFor(date, employeeId)
  if (!name) return null
  const rows = (await supabaseSelectFilter(
    'daily_plans',
    `plan_date=eq.${date}&employee_name=eq.${encodeURIComponent(name)}`,
    { limit: 1 }
  )) as Record<string, unknown>[]
  return rows?.[0] ? normalizePlanRow(rows[0]) : null
}

async function withItems(plan: DailyPlanRow | null) {
  if (!plan) return null
  const items = await getDailyPlanItems(plan.id)
  return { plan, items, summary: summarizePlanItems(items.map(planItemLite)) }
}

/** 내 업무표 (오늘이면 없을 때 자동 생성) + 공개된 내일 업무표 미리보기. planId 지정 시 권한 내 타인 업무표 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) return authResult.errorResponse
  const auth = authResult.auth
  const scope = resolveDailyPlanScope(auth)
  const sp = new URL(request.url).searchParams
  const today = getBangkokTodayDateString()
  const dateParam = String(sp.get('date') || '').trim()
  const date = YMD.test(dateParam) ? dateParam : today
  const planIdParam = Number(sp.get('planId') || 0)

  try {
    if (planIdParam > 0) {
      const plan = await getDailyPlanById(planIdParam)
      if (!plan) return NextResponse.json({ success: false, message: 'not found' }, { status: 404 })
      if (!canViewDailyPlan(scope, plan)) {
        return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 })
      }
      return NextResponse.json({ success: true, date: plan.plan_date, today: await withItems(plan), tomorrow: null })
    }

    let plan = await findOwnPlan(date, scope.actorEmployeeId, scope.actorName)
    if (!plan && date === today && scope.actorEmployeeId) {
      const emp = await loadPlanEmployeeById(scope.actorEmployeeId)
      if (emp) plan = await ensureDailyPlanOnDemand(date, emp, scope.actorName || 'self')
    }

    const nextDate = addDaysYmdUtc(date, 1)
    const nextPlan = await findOwnPlan(nextDate, scope.actorEmployeeId, scope.actorName)
    const tomorrow = nextPlan && nextPlan.published_at ? await withItems(nextPlan) : null

    return NextResponse.json({ success: true, date, today: await withItems(plan), tomorrow })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/daily_plans|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ success: true, date, today: null, tomorrow: null, notReady: true })
    }
    console.error('getMyDailyPlan:', e)
    return NextResponse.json({ success: false, message: '조회 실패' }, { status: 500 })
  }
}
