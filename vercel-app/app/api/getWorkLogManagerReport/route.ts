import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

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
      filters.push(`name=eq.${encodeURIComponent(employee)}`)
    }
    if (status && status !== 'all') {
      filters.push(`manager_check=eq.${encodeURIComponent(status)}`)
    }

    const filterStr = filters.join('&')
    const rows =
      (await supabaseSelectFilter('work_logs', filterStr, {
        order: 'log_date.asc',
      })) || []

    const result = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      date: r.log_date ? String(r.log_date).slice(0, 10) : '',
      dept: r.dept || '',
      name: r.name || '',
      content: r.content || '',
      progress: Number(r.progress) || 0,
      status: r.status || '',
      priority: r.priority || '',
      managerCheck: r.manager_check || '',
      managerComment: r.manager_comment || '',
    }))

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getWorkLogManagerReport:', e)
    return NextResponse.json([], { headers })
  }
}
