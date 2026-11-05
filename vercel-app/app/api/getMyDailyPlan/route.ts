import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokDateTimeString, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { addDaysYmdUtc, summarizePlanItems } from '@/lib/daily-plan-generate'
import { hmToMin, shouldKeepOvernightPlan } from '@/lib/daily-plan-timeline'
import {
  canViewDailyPlan,
  ensureDailyPlanOnDemand,
  getDailyPlanById,
  getDailyPlanFor,
  getDailyPlanItems,
  loadPlanEmployeeById,
  loadTravelMinutesByTemplate,
  normalizePlanRow,
  planItemLite,
  repairMissingDelegatedCopies,
  resolveDailyPlanScope,
  travelMinutesOfPlan,
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
  let items = await getDailyPlanItems(plan.id)
  if (plan.status !== 'closed') {
    try {
      const added = await repairMissingDelegatedCopies(plan, items)
      if (added > 0) items = await getDailyPlanItems(plan.id)
    } catch (e) {
      console.warn('repairMissingDelegatedCopies:', e instanceof Error ? e.message : e)
    }
  }
  const travel = await loadTravelMinutesByTemplate([plan.template_id])
  return {
    plan,
    items,
    summary: summarizePlanItems(items.map(planItemLite)),
    travelMinutes: travelMinutesOfPlan(plan, travel),
  }
}

/** 내 일정표 (오늘이면 없을 때 자동 생성) + 공개된 내일 일정표 미리보기. planId 지정 시 권한 내 타인 일정표 */
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
  const nowMin = hmToMin(getBangkokDateTimeString().slice(11, 16)) ?? 0

  try {
    if (planIdParam > 0) {
      const plan = await getDailyPlanById(planIdParam)
      if (!plan) return NextResponse.json({ success: false, message: 'not found' }, { status: 404 })
      if (!canViewDailyPlan(scope, plan)) {
        return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 })
      }
      return NextResponse.json({ success: true, date: plan.plan_date, today: await withItems(plan), tomorrow: null })
    }

    let workingDate = date
    let plan = await findOwnPlan(date, scope.actorEmployeeId, scope.actorName)
    /** 자정 이후에도 전날 야간 근무표(22:00–08:00 등)를 퇴근 시각까지 유지 */
    if (date === today && nowMin < 12 * 60) {
      const yesterday = addDaysYmdUtc(today, -1)
      const yPlan = await findOwnPlan(yesterday, scope.actorEmployeeId, scope.actorName)
      if (
        yPlan &&
        shouldKeepOvernightPlan({
          requestedYmd: date,
          calendarTodayYmd: today,
          nowMin,
          yesterdayStatus: yPlan.status,
          shiftIn: yPlan.shift_in,
          shiftOut: yPlan.shift_out,
        })
      ) {
        plan = yPlan
        workingDate = yesterday
      }
    }
    if (workingDate === date && !plan && date === today && scope.actorEmployeeId) {
      const emp = await loadPlanEmployeeById(scope.actorEmployeeId)
      if (emp) plan = await ensureDailyPlanOnDemand(date, emp, scope.actorName || 'self')
    } else if (workingDate === date && plan && !plan.template_id && date === today && scope.actorEmployeeId) {
      /** 템플릿 미매칭으로 생긴 빈 껍데기 → 앱 열 때 루틴 재채움 */
      const emp = await loadPlanEmployeeById(scope.actorEmployeeId)
      if (emp) {
        const healed = await ensureDailyPlanOnDemand(date, emp, scope.actorName || 'self')
        if (healed) plan = healed
      }
    }

    const nextDate = addDaysYmdUtc(workingDate, 1)
    let nextPlan = await findOwnPlan(nextDate, scope.actorEmployeeId, scope.actorName)
    if (nextPlan?.published_at && !nextPlan.template_id && scope.actorEmployeeId) {
      const emp = await loadPlanEmployeeById(scope.actorEmployeeId)
      if (emp) {
        const healed = await ensureDailyPlanOnDemand(nextDate, emp, scope.actorName || 'self')
        if (healed) nextPlan = healed
      }
    }
    const tomorrow = nextPlan && nextPlan.published_at ? await withItems(nextPlan) : null

    return NextResponse.json({ success: true, date: workingDate, today: await withItems(plan), tomorrow })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/daily_plans|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ success: true, date, today: null, tomorrow: null, notReady: true })
    }
    console.error('getMyDailyPlan:', e)
    return NextResponse.json({ success: false, message: '조회 실패' }, { status: 500 })
  }
}
