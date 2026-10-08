import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokDateTimeString, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { storeOpsStoreInScope } from '@/lib/store-ops-alert-utils'
import {
  dailyPlanRoleOf,
  dailyPlanScopeFilter,
  isOwnDailyPlan,
  loadActivePlanEmployees,
  normalizePlanItemRow,
  normalizePlanRow,
  resolveDailyPlanScope,
  type DailyPlanItemRow,
} from '@/lib/daily-plan-server'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** 날짜별 업무표 현황 — 진행률·예상/실제·지연 항목. candidates=1 이면 배정 가능한 직원 목록 포함 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  const sp = new URL(request.url).searchParams
  const today = getBangkokTodayDateString()
  const dateParam = String(sp.get('date') || '').trim()
  const date = YMD.test(dateParam) ? dateParam : today
  const nowHm = getBangkokDateTimeString().slice(11, 16)

  try {
    const sf = dailyPlanScopeFilter(scope)
    const filter = [`plan_date=eq.${date}`, sf].filter(Boolean).join('&')
    let planRows = ((await supabaseSelectFilter('daily_plans', filter, {
      order: 'role_scope.desc,store_name.asc,employee_name.asc',
      limit: 2000,
    })) || []) as Record<string, unknown>[]
    if (!scope.all && scope.actorEmployeeId) {
      const own = (await supabaseSelectFilter(
        'daily_plans',
        `plan_date=eq.${date}&employee_id=eq.${scope.actorEmployeeId}`,
        { limit: 1 }
      )) as Record<string, unknown>[]
      if (own?.[0] && !planRows.some((r) => Number(r.id) === Number(own[0].id))) planRows = [...own, ...planRows]
    }
    const plans = planRows.map(normalizePlanRow)

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

    const list = plans.map((p) => {
      const items = itemsByPlan.get(p.id) || []
      const work = items.filter((i) => i.source !== 'visit')
      const done = work.filter((i) => i.status === 'done')
      const late =
        date === today
          ? work.filter((i) => i.status === 'todo' && i.time_slot && i.time_slot < nowHm).length
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
      const emps = await loadActivePlanEmployees()
      candidates = emps
        .map((e) => ({ ...e, planRole: dailyPlanRoleOf(e) || '' }))
        .filter((e) => {
          if (!e.planRole) return false
          if (scope.office) return true
          if (scope.supervisor) return e.planRole !== 'supervisor' || e.id === scope.actorEmployeeId
          return e.planRole === 'staff' && storeOpsStoreInScope(e.store, scope.stores, false)
        })
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
