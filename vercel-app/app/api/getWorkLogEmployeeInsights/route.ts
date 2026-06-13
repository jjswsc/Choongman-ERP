import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  resolveWorkLogEmployeeById,
  workLogsEmployeeMatchFilter,
  attendanceLogsEmployeeMatchFilter,
} from '@/lib/work-log-name-server'
import { buildWorkLogEmployeeInsightsFallback } from '@/lib/work-log-aggregate-fallback'

function insightsHasData(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') return false
  const work = Array.isArray(payload.work) ? payload.work : []
  const attendance = Array.isArray(payload.attendance) ? payload.attendance : []
  const evaluations = Array.isArray(payload.evaluations) ? payload.evaluations : []
  return work.length > 0 || attendance.length > 0 || evaluations.length > 0
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const startStr = searchParams.get('startStr') || ''
    const endStr = searchParams.get('endStr') || ''
    const employeeIdRaw = searchParams.get('employeeId') || searchParams.get('employee') || ''
    const store = searchParams.get('store') || ''

    const employeeId = Math.floor(Number(employeeIdRaw))
    const emp =
      employeeIdRaw && employeeIdRaw !== 'all' && Number.isFinite(employeeId) && employeeId > 0
        ? await resolveWorkLogEmployeeById(employeeId)
        : null

    if (!emp) {
      return NextResponse.json(
        { employeeName: '', employeeStore: '', work: [], attendance: [], evaluations: [] },
        { headers }
      )
    }

    const storeFilter = store && store !== 'all' ? store : null

    try {
      const payload = await supabaseRpc<Record<string, unknown>>('get_work_log_employee_insights', {
        p_start: startStr,
        p_end: endStr,
        p_employee_id: emp.id,
        p_employee_name: emp.name,
        p_store: storeFilter,
      })
      if (insightsHasData(payload)) {
        return NextResponse.json(payload, { headers })
      }
    } catch {
      /* RPC 미배포 또는 빈 결과 — JS fallback */
    }

    const dateFilter = [
      `log_date=gte.${encodeURIComponent(startStr)}`,
      `log_date=lte.${encodeURIComponent(endStr)}`,
    ].join('&')

    const workRows =
      (await supabaseSelectFilter('work_logs', `${dateFilter}&${workLogsEmployeeMatchFilter(emp)}`, {
        order: 'log_date.asc',
        limit: 5000,
        select: 'log_date,name,employee_id,progress,status,store',
      })) || []

    const attendanceRows =
      (await supabaseSelectFilter(
        'attendance_logs',
        `${dateFilter}&${attendanceLogsEmployeeMatchFilter(emp)}`,
        {
          order: 'log_date.asc',
          limit: 5000,
          select: 'log_date,name,employee_id,log_type,ot_min,store_name',
        }
      )) || []

    const evalFilter = [
      `eval_date=gte.${encodeURIComponent(startStr)}`,
      `eval_date=lte.${encodeURIComponent(endStr)}`,
      `employee_name=eq.${encodeURIComponent(emp.name)}`,
    ]
    if (storeFilter) evalFilter.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)

    const evalRows =
      (await supabaseSelectFilter('evaluation_results', evalFilter.join('&'), {
        order: 'eval_date.desc',
        limit: 20,
        select: 'eval_date,eval_type,final_grade,store_name,evaluator,employee_name',
      })) || []

    const fallback = buildWorkLogEmployeeInsightsFallback(
      emp,
      workRows as {
        log_date?: string | Date
        name?: string
        employee_id?: number | null
        progress?: number
        status?: string
        store?: string | null
      }[],
      attendanceRows as {
        log_date?: string | Date
        name?: string
        employee_id?: number | null
        log_type?: string
        ot_min?: number | null
        store_name?: string | null
      }[],
      evalRows as {
        eval_date?: string | Date
        eval_type?: string
        final_grade?: string
        store_name?: string
        evaluator?: string
        employee_name?: string
      }[],
      startStr,
      endStr,
      storeFilter
    )

    return NextResponse.json(fallback, { headers })
  } catch (e) {
    console.error('getWorkLogEmployeeInsights:', e)
    return NextResponse.json(
      { employeeName: '', employeeStore: '', work: [], attendance: [], evaluations: [] },
      { headers }
    )
  }
}
