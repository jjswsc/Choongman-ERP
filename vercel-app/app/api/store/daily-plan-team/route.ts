import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokDateTimeString, getBangkokTodayDateString } from '@/lib/bangkok-time'
import {
  DAILY_PLAN_LATE_GRACE_MINUTES,
  computePlanTimeline,
  hmToMin,
  lateMinutes,
} from '@/lib/daily-plan-timeline'
import {
  canAssignDailyPlan,
  dailyPlanRoleOf,
  getDailyPlanFor,
  getDailyPlanItems,
  loadActivePlanEmployees,
  loadTravelMinutesByTemplate,
  resolveDailyPlanScope,
  travelMinutesOfPlan,
} from '@/lib/daily-plan-server'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** 모바일 ตารางงาน 팀 목록 — 매니저/SV/본사가 배정 가능한 직원 + 당일 일정 요약 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  const sp = new URL(request.url).searchParams
  const today = getBangkokTodayDateString()
  const dateParam = String(sp.get('date') || '').trim()
  const date = YMD.test(dateParam) ? dateParam : today
  const nowHm = getBangkokDateTimeString().slice(11, 16)
  const canManageTeam = !!(scope.office || scope.supervisor || scope.storeLead)

  if (!canManageTeam) {
    return NextResponse.json({
      success: true,
      date,
      today,
      nowHm,
      canManageTeam: false,
      mePlanId: null,
      members: [],
    })
  }

  try {
    const emps = await loadActivePlanEmployees()
    const candidates = emps
      .map((e) => ({ ...e, planRole: dailyPlanRoleOf(e) || '' }))
      .filter((e) => {
        if (!e.planRole) return false
        if (e.id === scope.actorEmployeeId) return false
        return canAssignDailyPlan(scope, {
          role: e.planRole as 'supervisor' | 'manager' | 'staff',
          store: e.store,
          employeeId: e.id,
        })
      })

    const nowMin = hmToMin(nowHm) ?? 0
    const members = []
    for (const e of candidates) {
      const plan = await getDailyPlanFor(date, e.id)
      let summary = { total: 0, done: 0, open: 0, late: 0, doneRate: 0 }
      if (plan) {
        const items = await getDailyPlanItems(plan.id)
        const travel = await loadTravelMinutesByTemplate([plan.template_id])
        const work = items.filter((i) => i.source !== 'visit')
        const done = work.filter((i) => i.status === 'done' || i.status === 'delegated').length
        const { slots } = computePlanTimeline(
          items.map((i) => ({
            id: i.id,
            source: i.source,
            storeName: i.store_name,
            timeSlot: i.time_slot,
            estMinutes: i.est_minutes,
          })),
          { shiftIn: plan.shift_in, travelMinutes: travelMinutesOfPlan(plan, travel) }
        )
        const late =
          date === today
            ? items.filter((i) => lateMinutes(slots.get(i.id), i.status, nowMin, DAILY_PLAN_LATE_GRACE_MINUTES) > 0)
                .length
            : date < today
              ? work.filter((i) => i.status === 'todo' || i.status === 'doing').length
              : 0
        summary = {
          total: work.length,
          done,
          open: work.length - done - work.filter((i) => i.status === 'skipped').length,
          late,
          doneRate: work.length > 0 ? Math.round((done / work.length) * 100) : 0,
        }
      }
      members.push({
        employeeId: e.id,
        name: e.name,
        nick: e.nick,
        store: e.store,
        job: e.job,
        planRole: e.planRole,
        planId: plan?.id ?? null,
        planStatus: plan?.status ?? null,
        published: !!plan?.published_at,
        ...summary,
      })
    }

    members.sort((a, b) => {
      const sa = String(a.store || '').localeCompare(String(b.store || ''))
      if (sa !== 0) return sa
      return String(a.name || '').localeCompare(String(b.name || ''))
    })

    let mePlanId: number | null = null
    if (scope.actorEmployeeId) {
      const mine = await getDailyPlanFor(date, scope.actorEmployeeId)
      mePlanId = mine?.id ?? null
    }

    return NextResponse.json({
      success: true,
      date,
      today,
      nowHm,
      canManageTeam: true,
      mePlanId,
      members,
      stores: scope.all ? [] : scope.stores,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/daily_plans|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({
        success: true,
        date,
        today,
        nowHm,
        canManageTeam: true,
        mePlanId: null,
        members: [],
        notReady: true,
      })
    }
    console.error('daily-plan-team:', e)
    return NextResponse.json({ success: false, message: '조회 실패' }, { status: 500 })
  }
}
