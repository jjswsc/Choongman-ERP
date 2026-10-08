import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { addBangkokCalendarDays, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import { dailyPlanScopeFilter, resolveDailyPlanScope } from '@/lib/daily-plan-server'

const YMD = /^\d{4}-\d{2}-\d{2}$/

type SummaryRow = {
  role_scope: string
  category: string
  title: string
  item_count: number
  done_count: number
  skipped_count: number
  est_sum: number
  actual_sum: number
  actual_done_est_sum: number
  overrun_count: number
}

/** 집계 폴백 — RPC 미배포 시 목록을 받아 JS로 그룹 */
async function fallbackSummary(start: string, end: string, scopeFilter: string): Promise<SummaryRow[]> {
  const plans = ((await supabaseSelectFilter(
    'daily_plans',
    [`plan_date=gte.${start}`, `plan_date=lte.${end}`, scopeFilter].filter(Boolean).join('&'),
    { select: 'id,role_scope', limit: 10000 }
  )) || []) as { id?: number; role_scope?: string }[]
  const roleOf = new Map(plans.map((p) => [Number(p.id), String(p.role_scope || 'staff')]))
  const ids = [...roleOf.keys()]
  const groups = new Map<string, SummaryRow>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const items = ((await supabaseSelectFilter(
      'daily_plan_items',
      `plan_id=in.(${chunk.join(',')})&source=neq.visit`,
      { select: 'plan_id,category,title,status,est_minutes,actual_minutes', limit: 50000 }
    )) || []) as {
      plan_id?: number
      category?: string
      title?: string
      status?: string
      est_minutes?: number
      actual_minutes?: number | null
    }[]
    for (const it of items) {
      const role = roleOf.get(Number(it.plan_id)) || 'staff'
      const category = String(it.category || '기타')
      const title = String(it.title || '')
      const key = `${role}|${category}|${title}`
      const g =
        groups.get(key) ||
        ({
          role_scope: role,
          category,
          title,
          item_count: 0,
          done_count: 0,
          skipped_count: 0,
          est_sum: 0,
          actual_sum: 0,
          actual_done_est_sum: 0,
          overrun_count: 0,
        } as SummaryRow)
      const est = Number(it.est_minutes || 0)
      g.item_count += 1
      g.est_sum += est
      if (it.status === 'skipped') g.skipped_count += 1
      if (it.status === 'done') {
        const act = Number(it.actual_minutes ?? est)
        g.done_count += 1
        g.actual_sum += act
        g.actual_done_est_sum += est
        if (act > est) g.overrun_count += 1
      }
      groups.set(key, g)
    }
  }
  return [...groups.values()]
}

/** 기간 내 항목별 예상 vs 실제 시간 (템플릿 조정 근거) */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  const sp = new URL(request.url).searchParams
  const today = getBangkokTodayDateString()
  const end = YMD.test(String(sp.get('end') || '')) ? String(sp.get('end')) : today
  const start = YMD.test(String(sp.get('start') || '')) ? String(sp.get('start')) : addBangkokCalendarDays(end, -13)

  try {
    let rows: SummaryRow[] = []
    let source: 'rpc' | 'fallback' = 'rpc'
    try {
      rows = (await supabaseRpc<SummaryRow[]>('get_daily_plan_time_summary', {
        p_start: start,
        p_end: end,
        p_stores: scope.all ? null : scope.stores,
      })) || []
    } catch (e) {
      source = 'fallback'
      console.warn('get_daily_plan_time_summary RPC unavailable, fallback:', e instanceof Error ? e.message : e)
      rows = await fallbackSummary(start, end, dailyPlanScopeFilter(scope))
    }
    const list = rows
      .map((r) => {
        const done = Number(r.done_count || 0)
        const actual = Number(r.actual_sum || 0)
        const doneEst = Number(r.actual_done_est_sum || 0)
        return {
          roleScope: String(r.role_scope || ''),
          category: String(r.category || ''),
          title: String(r.title || ''),
          count: Number(r.item_count || 0),
          done,
          skipped: Number(r.skipped_count || 0),
          estSum: Number(r.est_sum || 0),
          actualSum: actual,
          avgEst: done > 0 ? Math.round(doneEst / done) : 0,
          avgActual: done > 0 ? Math.round(actual / done) : 0,
          overrun: Number(r.overrun_count || 0),
        }
      })
      .sort((a, b) => b.actualSum - a.actualSum || b.count - a.count)
    return NextResponse.json({ success: true, start, end, source, list })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/daily_plan|relation .* does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ success: true, start, end, list: [], notReady: true })
    }
    console.error('getDailyPlanTimeSummary:', e)
    return NextResponse.json({ success: false, message: '조회 실패', list: [] }, { status: 500 })
  }
}
