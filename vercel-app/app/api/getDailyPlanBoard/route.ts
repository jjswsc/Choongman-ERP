import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokDateTimeString, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  appendDailyPlanTenantFilter,
  canListDailyPlanCandidate,
  canViewDailyPlan,
  dailyPlanRoleOf,
  dailyPlanScopeFilter,
  isOwnDailyPlan,
  loadActivePlanEmployees,
  loadTravelMinutesByTemplate,
  normalizePlanItemRow,
  normalizePlanRow,
  resolveDailyPlanScope,
  resolveDailyPlanTenantScope,
  travelMinutesOfPlan,
  type DailyPlanItemRow,
} from '@/lib/daily-plan-server'
import { selectWithSaasTenantFallback } from '@/lib/saas-tenant-scope'
import { isDailyPlanProgressDone } from '@/lib/daily-plan-generate'
import {
  DAILY_PLAN_LATE_GRACE_MINUTES,
  computePlanTimeline,
  hmToMin,
  lateMinutes,
} from '@/lib/daily-plan-timeline'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** 날짜별 일정표 현황 — 진행률·예상/실제·지연 항목. candidates=1 이면 배정 가능한 직원 목록 포함 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  const tenantScope = await resolveDailyPlanTenantScope(authResult.auth)
  const sp = new URL(request.url).searchParams
  const today = getBangkokTodayDateString()
  const dateParam = String(sp.get('date') || '').trim()
  const date = YMD.test(dateParam) ? dateParam : today
  const nowHm = getBangkokDateTimeString().slice(11, 16)

  try {
    const sf = dailyPlanScopeFilter(scope)
    const baseFilter = [`plan_date=eq.${date}`, sf].filter(Boolean).join('&')
    let planRows = ((await selectWithSaasTenantFallback('daily_plans', tenantScope, baseFilter, (filter) =>
      supabaseSelectFilter('daily_plans', filter, {
        order: 'role_scope.desc,store_name.asc,employee_name.asc',
        limit: 2000,
      })
    )) || []) as Record<string, unknown>[]
    if (!scope.all && scope.actorEmployeeId) {
      const ownFilter = appendDailyPlanTenantFilter(
        `plan_date=eq.${date}&employee_id=eq.${scope.actorEmployeeId}`,
        tenantScope,
        'daily_plans'
      )
      const own = (await supabaseSelectFilter('daily_plans', ownFilter, { limit: 1 })) as Record<
        string,
        unknown
      >[]
      if (own?.[0] && !planRows.some((r) => Number(r.id) === Number(own[0].id))) planRows = [...own, ...planRows]
    }
    const plans = planRows.map(normalizePlanRow).filter((p) => canViewDailyPlan(scope, p))

    const itemsByPlan = new Map<number, DailyPlanItemRow[]>()
    const ids = plans.map((p) => p.id)
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const rows = ((await supabaseSelectFilter('daily_plan_items', `plan_id=in.(${chunk.join(',')})`, {
        order: 'sort_order.asc,id.asc',
        limit: 20000,
      })) || []) as Record<string, unknown>[]
      for (const r of rows) {
        const it = normalizePlanItemRow(r)
        const list = itemsByPlan.get(it.plan_id) || []
        list.push(it)
        itemsByPlan.set(it.plan_id, list)
      }
    }

    const travel = await loadTravelMinutesByTemplate(plans.map((p) => p.template_id))
    const nowMin = hmToMin(nowHm) ?? 0
    const list = plans.map((p) => {
      const items = itemsByPlan.get(p.id) || []
      const work = items.filter((i) => i.source !== 'visit' && i.status !== 'cancelled')
      const done = work.filter((i) => isDailyPlanProgressDone(i.status))
      const { slots } = computePlanTimeline(
        items
          .filter((i) => i.status !== 'cancelled')
          .map((i) => ({ id: i.id, source: i.source, storeName: i.store_name, timeSlot: i.time_slot, estMinutes: i.est_minutes })),
        { shiftIn: p.shift_in, travelMinutes: travelMinutesOfPlan(p, travel) }
      )
      const late =
        date === today
          ? items.filter((i) => lateMinutes(slots.get(i.id), i.status, nowMin, DAILY_PLAN_LATE_GRACE_MINUTES) > 0).length
          : date < today
            ? work.filter((i) => i.status === 'todo' || i.status === 'doing').length
            : 0
      const doing = items.find((i) => i.status === 'doing')
      const next = items.find((i) => i.status === 'todo')
      const visits = items.filter((i) => i.source === 'visit')
      return {
        ...p,
        total: work.length,
        done: done.length,
        skipped: work.filter((i) => i.status === 'skipped').length,
        estMinutes: work.reduce((s, i) => s + i.est_minutes, 0),
        actualMinutes: done.reduce((s, i) => s + (i.actual_minutes ?? i.est_minutes), 0),
        late,
        doingTitle: doing ? doing.title : '',
        nextTitle: next ? next.title : '',
        visitsDone: visits.filter((i) => i.status === 'done').length,
        visitsTotal: visits.length,
        hqTasks: items
          .filter((i) => i.source === 'hq_task')
          .map((i) => ({ id: i.id, title: i.title, store: i.store_name, estMinutes: i.est_minutes, status: i.status })),
        isMine: isOwnDailyPlan(scope, p),
      }
    })

    let candidates: { id: number; name: string; nick: string; store: string; job: string; planRole: string }[] = []
    if (sp.get('candidates') === '1') {
      const emps = await loadActivePlanEmployees(tenantScope)
      candidates = emps
        .map((e) => {
          const planRole = dailyPlanRoleOf(e)
          return planRole ? { ...e, planRole } : null
        })
        .filter((e): e is NonNullable<typeof e> => !!e)
        .filter((e) =>
          canListDailyPlanCandidate(scope, {
            role: e.planRole,
            store: e.store,
            employeeId: e.id,
          })
        )
        .map(({ id, name, nick, store, job, planRole }) => ({ id, name, nick, store, job, planRole }))
    }

    return NextResponse.json({
      success: true,
      date,
      today,
      nowHm,
      plans: list,
      candidates,
      canEditTemplates: scope.canEditTemplates,
      canAssignAll: scope.office || scope.supervisor,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/daily_plans|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ success: true, date, today, nowHm, plans: [], candidates: [], notReady: true })
    }
    console.error('getDailyPlanBoard:', e)
    return NextResponse.json({ success: false, message: '조회 실패' }, { status: 500 })
  }
}
