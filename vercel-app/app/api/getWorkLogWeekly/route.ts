import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseRpc,
} from '@/lib/supabase-server'
import {
  resolveWorkLogFilterNameFromEmployeeIdParam,
  workLogsOrEmployeeIdOrNameFilter,
} from '@/lib/work-log-name-server'
import { dedupeWorkLogReportByDateNameContent } from '@/lib/work-log-dedupe'

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const startStr = searchParams.get('startStr') || searchParams.get('start') || ''
    const endStr = searchParams.get('endStr') || searchParams.get('end') || ''
    const dept = searchParams.get('dept') || ''
    const employee = searchParams.get('employee') || ''
    const store = searchParams.get('store') || ''

    const employeeId =
      employee && employee !== 'all' ? Number.parseInt(String(employee).trim(), 10) : NaN
    const resolvedName =
      employee && employee !== 'all'
        ? await resolveWorkLogFilterNameFromEmployeeIdParam(employee)
        : null

    try {
      const rpcRows = await supabaseRpc<
        {
          employee_name: string
          employee_role: string
          total_tasks: number
          completed: number
          carried: number
          in_progress: number
          avg_progress: number
        }[]
      >('get_work_log_weekly_summary', {
        p_start: startStr,
        p_end: endStr,
        p_dept: dept && dept !== 'all' ? dept : null,
        p_employee_name:
          employee && employee !== 'all' && resolvedName ? resolvedName : null,
        p_employee_id:
          Number.isFinite(employeeId) && employeeId > 0 ? employeeId : null,
        p_store: store && store !== 'all' ? store : null,
      })
      if (Array.isArray(rpcRows) && rpcRows.length >= 0) {
        const summaries = rpcRows.map((r) => ({
          employee: r.employee_name,
          role: r.employee_role || '',
          totalTasks: Number(r.total_tasks) || 0,
          completed: Number(r.completed) || 0,
          carried: Number(r.carried) || 0,
          inProgress: Number(r.in_progress) || 0,
          avgProgress: Math.round(Number(r.avg_progress) || 0),
        }))
        const totalTasks = summaries.reduce((a, s) => a + s.totalTasks, 0)
        const totalCompleted = summaries.reduce((a, s) => a + s.completed, 0)
        const totalCarried = summaries.reduce((a, s) => a + s.carried, 0)
        const overallAvg =
          summaries.length > 0
            ? Math.round(summaries.reduce((a, s) => a + s.avgProgress, 0) / summaries.length)
            : 0
        return NextResponse.json(
          { summaries, totalTasks, totalCompleted, totalCarried, overallAvg },
          { headers }
        )
      }
    } catch {
      /* RPC 미배포 — JS fallback */
    }

    let fullFilter =
      `log_date=gte.${encodeURIComponent(startStr)}&log_date=lte.${encodeURIComponent(endStr)}`
    if (dept && dept !== 'all') fullFilter += `&dept=eq.${encodeURIComponent(dept)}`
    if (store && store !== 'all') fullFilter += `&store=eq.${encodeURIComponent(store)}`
    if (employee && employee !== 'all') {
      const id = Number.parseInt(String(employee).trim(), 10)
      const resolvedFromId = await resolveWorkLogFilterNameFromEmployeeIdParam(employee)
      if (resolvedFromId && Number.isFinite(id) && id > 0) {
        fullFilter += `&${workLogsOrEmployeeIdOrNameFilter(id, resolvedFromId)}`
      } else {
        const nameOnly = resolvedFromId || String(employee).trim()
        if (nameOnly) fullFilter += `&name=eq.${encodeURIComponent(nameOnly)}`
      }
    }

    const rows =
      (await supabaseSelectFilter('work_logs', fullFilter, {
        order: 'log_date.asc',
        limit: 5000,
        select: 'id,log_date,dept,name,employee_id,content,progress,status,priority,manager_check',
      })) || []

    const empList = ((await supabaseSelect('employees', { order: 'id.asc', select: 'name,nick,job', limit: 2000 })) || []) as { name?: string; nick?: string; job?: string }[]

    const nameToRole: Record<string, string> = {}
    for (const e of empList) {
      const full = String(e.name || '').trim()
      const nk = String(e.nick || '').trim()
      if (full) nameToRole[full] = e.job || ''
      if (nk && nk !== full) nameToRole[nk] = e.job || ''
    }

    const byEmployee: Record<
      string,
      { total: number; completed: number; carried: number; inProgress: number; progressSum: number; count: number }
    > = {}

    const dedupedRows = dedupeWorkLogReportByDateNameContent(
      (rows as {
        id?: string
        log_date?: string | Date
        name: string
        content?: string
        progress?: number
        status?: string
      }[]).map((r) => ({
        id: String(r.id ?? ''),
        date: r.log_date ? String(r.log_date).slice(0, 10) : '',
        name: r.name || '',
        content: String(r.content || ''),
        progress: Number(r.progress) || 0,
        status: String(r.status || ''),
      }))
    )

    for (const r of dedupedRows) {
      const name = r.name || ''
      if (!name) continue
      if (!byEmployee[name]) {
        byEmployee[name] = {
          total: 0,
          completed: 0,
          carried: 0,
          inProgress: 0,
          progressSum: 0,
          count: 0,
        }
      }
      const p = byEmployee[name]
      p.total++
      p.progressSum += Number(r.progress) || 0
      p.count++
      const st = String(r.status || '')
      if (st === 'Finish' || (Number(r.progress) || 0) >= 100) p.completed++
      else if (st === 'Continue' || st === 'Carry Over') p.carried++
      else p.inProgress++
    }

    const summaries = Object.entries(byEmployee).map(([employee, p]) => ({
      employee,
      role: nameToRole[employee] || '',
      totalTasks: p.total,
      completed: p.completed,
      carried: p.carried,
      inProgress: p.inProgress,
      avgProgress:
        p.count > 0 ? Math.round(p.progressSum / p.count) : 0,
    }))

    const totalTasks = summaries.reduce((a, s) => a + s.totalTasks, 0)
    const totalCompleted = summaries.reduce((a, s) => a + s.completed, 0)
    const totalCarried = summaries.reduce((a, s) => a + s.carried, 0)
    const overallAvg =
      summaries.length > 0
        ? Math.round(
            summaries.reduce((a, s) => a + s.avgProgress, 0) / summaries.length
          )
        : 0

    return NextResponse.json(
      {
        summaries,
        totalTasks,
        totalCompleted,
        totalCarried,
        overallAvg,
      },
      { headers }
    )
  } catch (e) {
    console.error('getWorkLogWeekly:', e)
    return NextResponse.json(
      {
        summaries: [],
        totalTasks: 0,
        totalCompleted: 0,
        totalCarried: 0,
        overallAvg: 0,
      },
      { headers }
    )
  }
}
