import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { addDaysYmdUtc } from '@/lib/daily-plan-generate'
import { dailyPlanScopeFilter, normalizePlanRow, resolveDailyPlanScope } from '@/lib/daily-plan-server'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** 7일 일정 요약 — 사람 × 날짜 (방문 매장·진행) */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  const sp = new URL(request.url).searchParams
  const today = getBangkokTodayDateString()
  const startParam = String(sp.get('start') || '').trim()
  const start = YMD.test(startParam) ? startParam : today
  const end = addDaysYmdUtc(start, 6)

  try {
    const sf = dailyPlanScopeFilter(scope)
    const filter = [`plan_date=gte.${start}`, `plan_date=lte.${end}`, sf].filter(Boolean).join('&')
    const plans = (
      ((await supabaseSelectFilter('daily_plans', filter, {
        select: 'id,plan_date,employee_id,employee_name,employee_store,role_scope,position,store_name,route_stores,status,published_at,shift_in,shift_out',
        order: 'plan_date.asc,employee_name.asc',
        limit: 5000,
      })) || []) as Record<string, unknown>[]
    ).map(normalizePlanRow)

    const counts = new Map<number, { total: number; done: number }>()
    const ids = plans.map((p) => p.id)
    for (let i = 0; i < ids.length; i += 200) {
      const rows = ((await supabaseSelectFilter(
        'daily_plan_items',
        `plan_id=in.(${ids.slice(i, i + 200).join(',')})&source=neq.visit`,
        { select: 'plan_id,status', limit: 50000 }
      )) || []) as { plan_id?: number; status?: string }[]
      for (const r of rows) {
        const c = counts.get(Number(r.plan_id)) || { total: 0, done: 0 }
        c.total += 1
        if (r.status === 'done') c.done += 1
        counts.set(Number(r.plan_id), c)
      }
    }

    return NextResponse.json({
      success: true,
      start,
      end,
      today,
      list: plans.map((p) => ({
        id: p.id,
        date: p.plan_date,
        employeeId: p.employee_id,
        employeeName: p.employee_name,
        employeeStore: p.employee_store,
        role: p.role_scope,
        position: p.position,
        store: p.store_name,
        route: p.route_stores || [],
        status: p.status,
        published: !!p.published_at,
        shiftIn: p.shift_in,
        shiftOut: p.shift_out,
        total: counts.get(p.id)?.total || 0,
        done: counts.get(p.id)?.done || 0,
      })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/daily_plans|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ success: true, start, end, today, list: [], notReady: true })
    }
    console.error('getDailyPlanWeek:', e)
    return NextResponse.json({ success: false, message: '조회 실패' }, { status: 500 })
  }
}
