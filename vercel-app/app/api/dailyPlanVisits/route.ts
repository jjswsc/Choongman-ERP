import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { addDaysYmdUtc } from '@/lib/daily-plan-generate'
import { suggestVisitStores } from '@/lib/daily-plan-timeline'
import {
  addVisitStoreToPlan,
  canAssignDailyPlan,
  dailyPlanRoleOf,
  loadLastVisitByStore,
  loadOpenActionsLite,
  loadPlanEmployeeById,
  normalizePlanRow,
  planRecipient,
  resolveDailyPlanScope,
  supervisorCandidateStores,
} from '@/lib/daily-plan-server'
import { pushStoreActionNotice } from '@/lib/store-action-server'

const YMD = /^\d{4}-\d{2}-\d{2}$/
/** 방문 공백 경고 기준 — 기한초과 과제가 있는데 이 일수 안에 방문 계획 없음 */
const COVERAGE_WINDOW_DAYS = 3

function key(s: string): string {
  return String(s || '').trim().toLowerCase()
}

/**
 * mode=coverage&stores=A,B — 매장별 마지막 방문·다음 방문 계획(7일)
 * mode=suggest&employeeId=&date= — 슈퍼바이저 방문 추천 매장
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  const sp = new URL(request.url).searchParams
  const today = getBangkokTodayDateString()
  const mode = String(sp.get('mode') || 'coverage')

  try {
    if (mode === 'suggest') {
      const date = YMD.test(String(sp.get('date') || '')) ? String(sp.get('date')) : addDaysYmdUtc(today, 1)
      const empId = Number(sp.get('employeeId') || scope.actorEmployeeId || 0)
      const emp = await loadPlanEmployeeById(empId)
      if (!emp || dailyPlanRoleOf(emp) !== 'supervisor') return NextResponse.json({ success: true, list: [] })
      const [actions, others, last] = await Promise.all([
        loadOpenActionsLite(),
        supabaseSelectFilter('daily_plans', `plan_date=eq.${date}&employee_id=neq.${emp.id}`, {
          select: 'route_stores',
          limit: 5000,
        }).catch(() => []) as Promise<{ route_stores?: unknown }[]>,
        loadLastVisitByStore(addDaysYmdUtc(date, -60)),
      ])
      const taken = (others || []).flatMap((r) => (Array.isArray(r.route_stores) ? r.route_stores.map(String) : []))
      const list = suggestVisitStores({
        candidates: supervisorCandidateStores(emp),
        actions,
        lastVisitByStore: new Map([...last].map(([s, v]) => [s, v.date])),
        dateYmd: date,
        exclude: taken,
        max: 6,
      })
      return NextResponse.json({ success: true, date, list, hasCandidates: supervisorCandidateStores(emp).length > 0 })
    }

    const stores = String(sp.get('stores') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100)
    if (stores.length === 0) return NextResponse.json({ success: true, list: [] })
    const [last, planRows] = await Promise.all([
      loadLastVisitByStore(addDaysYmdUtc(today, -60)),
      supabaseSelectFilter(
        'daily_plans',
        `plan_date=gte.${today}&plan_date=lte.${addDaysYmdUtc(today, 7)}&role_scope=eq.supervisor`,
        { select: 'id,plan_date,employee_name,route_stores,status', order: 'plan_date.asc', limit: 2000 }
      ).catch(() => []) as Promise<Record<string, unknown>[]>,
    ])
    const lastByKey = new Map([...last].map(([s, v]) => [key(s), v]))
    const plans = (planRows || []).map(normalizePlanRow)
    const windowEnd = addDaysYmdUtc(today, COVERAGE_WINDOW_DAYS)
    const list = stores.map((store) => {
      const lv = lastByKey.get(key(store))
      const next = plans.find((p) => (p.route_stores || []).some((s) => key(s) === key(store)))
      return {
        store,
        lastVisitDate: lv?.date || '',
        lastVisitBy: lv?.name || '',
        nextPlanDate: next?.plan_date || '',
        nextPlanBy: next?.employee_name || '',
        plannedSoon: !!next && next.plan_date <= windowEnd,
      }
    })
    return NextResponse.json({ success: true, today, windowDays: COVERAGE_WINDOW_DAYS, list })
  } catch (e) {
    console.error('dailyPlanVisits GET:', e)
    return NextResponse.json({ success: false, message: '조회 실패' }, { status: 500 })
  }
}

/** 슈퍼바이저 일정에 방문 매장 추가 (본인 또는 배정 권한자) */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  try {
    const body = (await request.json()) as { store?: string; date?: string; employeeId?: number | string }
    const today = getBangkokTodayDateString()
    const store = String(body.store || '').trim()
    const date = YMD.test(String(body.date || '')) ? String(body.date) : addDaysYmdUtc(today, 1)
    if (!store) return NextResponse.json({ success: false, message: 'store required' }, { status: 400 })
    if (date < today || date > addDaysYmdUtc(today, 7)) {
      return NextResponse.json({ success: false, messageKey: 'dp_err_date_range' }, { status: 400 })
    }
    const empId = Number(body.employeeId || scope.actorEmployeeId || 0)
    const emp = await loadPlanEmployeeById(empId)
    if (!emp || dailyPlanRoleOf(emp) !== 'supervisor') {
      return NextResponse.json({ success: false, messageKey: 'dp_err_not_supervisor' }, { status: 400 })
    }
    if (!canAssignDailyPlan(scope, { role: 'supervisor', store: emp.store, employeeId: emp.id })) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 })
    }
    const r = await addVisitStoreToPlan({ date, employee: emp, store, actor: scope.actorName || 'store_actions' })
    if (r.closed) return NextResponse.json({ success: false, messageKey: 'dp_err_closed' }, { status: 409 })
    if (r.added && r.plan?.published_at && emp.id !== scope.actorEmployeeId) {
      await pushStoreActionNotice({
        title: '📍 방문 매장 추가 · เพิ่มสาขาที่ต้องเยี่ยมครับ',
        body: `${date} · ${store}`,
        recipients: [planRecipient(r.plan)],
      })
    }
    return NextResponse.json({ success: true, added: r.added, planId: r.plan?.id ?? null, employeeName: emp.name, date })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/daily_plan|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ success: false, messageKey: 'dp_not_ready' }, { status: 503 })
    }
    console.error('dailyPlanVisits POST:', e)
    return NextResponse.json({ success: false, message: '저장 실패' }, { status: 500 })
  }
}
