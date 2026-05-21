import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
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
    const status = searchParams.get('status') || ''

    const filters: string[] = []
    filters.push(`log_date=gte.${encodeURIComponent(startStr)}`)
    filters.push(`log_date=lte.${encodeURIComponent(endStr)}`)
    if (dept && dept !== 'all') {
      filters.push(`dept=eq.${encodeURIComponent(dept)}`)
    }
    if (employee && employee !== 'all') {
      const id = Number.parseInt(String(employee).trim(), 10)
      const resolvedFromId = await resolveWorkLogFilterNameFromEmployeeIdParam(employee)
      if (resolvedFromId && Number.isFinite(id) && id > 0) {
        filters.push(workLogsOrEmployeeIdOrNameFilter(id, resolvedFromId))
      } else {
        const nameOnly = resolvedFromId || String(employee).trim()
        if (nameOnly) filters.push(`name=eq.${encodeURIComponent(nameOnly)}`)
      }
    }
    if (status && status !== 'all') {
      filters.push(`manager_check=eq.${encodeURIComponent(status)}`)
    }

    const filterStr = filters.join('&')
    const rows =
      (await supabaseSelectFilter('work_logs', filterStr, {
        order: 'log_date.asc',
        limit: 5000,
        select: 'id,log_date,dept,name,employee_id,content,progress,status,priority,manager_check,manager_comment',
      })) || []

    const result = dedupeWorkLogReportByDateNameContent(
      rows.map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        date: r.log_date ? String(r.log_date).slice(0, 10) : '',
        dept: String(r.dept || ''),
        name: String(r.name || ''),
        content: String(r.content || ''),
        progress: Number(r.progress) || 0,
        status: String(r.status || ''),
        priority: String(r.priority || ''),
        managerCheck: String(r.manager_check || ''),
        managerComment: String(r.manager_comment || ''),
      }))
    ).map((r) => ({
      id: r.id,
      date: r.date,
      dept: r.dept,
      name: r.name,
      content: r.content,
      progress: r.progress,
      status: r.status,
      priority: r.priority,
      managerCheck: r.managerCheck,
      managerComment: r.managerComment,
    }))

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getWorkLogManagerReport:', e)
    return NextResponse.json([], { headers })
  }
}
