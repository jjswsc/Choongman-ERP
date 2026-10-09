import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { addDaysYmdUtc } from '@/lib/daily-plan-generate'
import {
  addActionItemToPlan,
  dailyPlanRoleOf,
  ensureDailyPlan,
  ensureDailyPlanOnDemand,
  findPlanEmployee,
  getDailyPlanFor,
  normalizePlanRow,
  planRecipient,
} from '@/lib/daily-plan-server'
import {
  pushStoreActionNotice,
  resolveStoreActionScope,
  storeActionStoreAllowed,
} from '@/lib/store-action-server'

const YMD = /^\d{4}-\d{2}-\d{2}$/

type ActionPlanLink = {
  planId: number
  date: string
  employeeName: string
  itemStatus: string
  planStatus: string
}

/** 개선 과제별 일정 배정 현황 (ids=1,2,3 — 최대 300) */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const ids = String(new URL(request.url).searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, 300)
  if (ids.length === 0) return NextResponse.json({ success: true, links: {} })
  try {
    const items = ((await supabaseSelectFilter(
      'daily_plan_items',
      `source=eq.action&ref_id=in.(${ids.join(',')})`,
      { select: 'plan_id,ref_id,status', limit: 5000 }
    )) || []) as { plan_id?: number; ref_id?: string; status?: string }[]
    if (items.length === 0) return NextResponse.json({ success: true, links: {} })
    const planIds = [...new Set(items.map((i) => Number(i.plan_id)))]
    const plans = new Map<number, ReturnType<typeof normalizePlanRow>>()
    for (let i = 0; i < planIds.length; i += 200) {
      const rows = ((await supabaseSelectFilter('daily_plans', `id=in.(${planIds.slice(i, i + 200).join(',')})`, {
        select: 'id,plan_date,employee_name,status',
        limit: 1000,
      })) || []) as Record<string, unknown>[]
      for (const r of rows) {
        const p = normalizePlanRow(r)
        plans.set(p.id, p)
      }
    }
    const links: Record<string, ActionPlanLink[]> = {}
    for (const it of items) {
      const p = plans.get(Number(it.plan_id))
      if (!p) continue
      const key = String(it.ref_id)
      ;(links[key] ||= []).push({
        planId: p.id,
        date: p.plan_date,
        employeeName: p.employee_name,
        itemStatus: String(it.status || 'todo'),
        planStatus: p.status,
      })
    }
    for (const k of Object.keys(links)) links[k] = links[k].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
    return NextResponse.json({ success: true, links })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/daily_plan|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ success: true, links: {}, notReady: true })
    }
    console.error('storeActionDailyPlan GET:', e)
    return NextResponse.json({ success: false, message: '조회 실패' }, { status: 500 })
  }
}

/** 개선 과제를 담당자·재확인 담당자·본인의 특정 날짜 일정에 넣기 (오늘~7일 후) */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const auth = authResult.auth
  const scope = resolveStoreActionScope(auth)
  try {
    const body = (await request.json()) as { actionId?: number | string; date?: string; who?: string }
    const actionId = Number(body.actionId || 0)
    const today = getBangkokTodayDateString()
    const date = YMD.test(String(body.date || '')) ? String(body.date) : today
    if (!actionId) return NextResponse.json({ success: false, message: 'actionId required' }, { status: 400 })
    if (date < today || date > addDaysYmdUtc(today, 7)) {
      return NextResponse.json({ success: false, messageKey: 'dp_err_date_range' }, { status: 400 })
    }
    const rows = ((await supabaseSelectFilter('store_action_items', `id=eq.${actionId}`, {
      select: 'id,store_name,title,status,due_date,owner_name,owner_user_id,verifier_name,verifier_user_id',
      limit: 1,
    })) || []) as Record<string, unknown>[]
    const a = rows[0]
    if (!a) return NextResponse.json({ success: false, message: 'not found' }, { status: 404 })
    const store = String(a.store_name || '')
    if (!storeActionStoreAllowed(scope, store)) {
      return NextResponse.json({ success: false, message: '권한이 없는 매장입니다.' }, { status: 403 })
    }
    const who = body.who === 'verifier' || body.who === 'me' ? body.who : 'owner'
    const emp =
      who === 'me'
        ? await findPlanEmployee({ userId: scope.actorEmployeeId, name: scope.actorName, store: auth.store })
        : who === 'verifier'
          ? await findPlanEmployee({ userId: String(a.verifier_user_id || ''), name: String(a.verifier_name || ''), store })
          : await findPlanEmployee({ userId: String(a.owner_user_id || ''), name: String(a.owner_name || ''), store })
    if (!emp) return NextResponse.json({ success: false, messageKey: 'dp_err_no_person' }, { status: 400 })
    const role = dailyPlanRoleOf(emp)
    if (!role) return NextResponse.json({ success: false, messageKey: 'dp_err_no_role' }, { status: 400 })

    const actor = scope.actorName || 'store_actions'
    let plan = await getDailyPlanFor(date, emp.id)
    if (!plan) plan = await ensureDailyPlanOnDemand(date, emp, actor)
    if (!plan) plan = (await ensureDailyPlan({ date, employee: emp, role, actor, force: true })).plan
    if (!plan) return NextResponse.json({ success: false, message: '일정을 만들지 못했습니다.' }, { status: 500 })
    if (plan.status === 'closed') return NextResponse.json({ success: false, messageKey: 'dp_err_closed' }, { status: 409 })

    const kind = who === 'verifier' || String(a.status) === 'pending_verify' ? 'verify' : 'owner'
    const r = await addActionItemToPlan(
      plan,
      { id: actionId, store, title: String(a.title || ''), dueDate: String(a.due_date || '').slice(0, 10) },
      kind
    )
    const isSelf = scope.actorEmployeeId != null && scope.actorEmployeeId === emp.id
    if (r.added && !isSelf) {
      await pushStoreActionNotice({
        title: '📅 일정에 개선 과제 추가 · เพิ่มงานปรับปรุงในตารางงานครับ',
        body: `${date} · ${store} · ${String(a.title || '')}`,
        recipients: [planRecipient(plan)],
      })
    }
    return NextResponse.json({ success: true, planId: plan.id, added: r.added, employeeName: emp.name, date })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/daily_plan|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ success: false, messageKey: 'dp_not_ready' }, { status: 503 })
    }
    console.error('storeActionDailyPlan POST:', e)
    return NextResponse.json({ success: false, message: '저장 실패' }, { status: 500 })
  }
}
