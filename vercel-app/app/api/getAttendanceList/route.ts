import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startDate = String(searchParams.get('startDate') || searchParams.get('start') || '').trim()
  const endDate = String(searchParams.get('endDate') || searchParams.get('end') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const employeeFilter = String(searchParams.get('employeeFilter') || searchParams.get('name') || '').trim()

  if (!startDate || !endDate || !storeFilter || !employeeFilter) {
    return NextResponse.json([], { headers })
  }

  try {
    const startD = new Date(startDate + 'T12:00:00')
    const endD = new Date(endDate + 'T12:00:00')
    const endExclusive = new Date(endD)
    endExclusive.setDate(endExclusive.getDate() + 1)
    const startStr = startD.toISOString().slice(0, 10)
    const endStr = endExclusive.toISOString().slice(0, 10)

    const filter = `store_name=ilike.${encodeURIComponent(storeFilter)}&name=ilike.${encodeURIComponent(employeeFilter)}&log_at=gte.${startStr}&log_at=lt.${endStr}`
    const rows = (await supabaseSelectFilter(
      'attendance_logs',
      filter,
      { order: 'log_at.asc', limit: 500, select: 'log_at,log_type,status,late_min,ot_min' }
    )) as { log_at?: string; log_type?: string; status?: string; late_min?: number; ot_min?: number }[]

    const list: { timestamp: string; type: string; status: string; late_min?: number; ot_min?: number }[] = []
    for (const r of rows || []) {
      list.push({
        timestamp: r.log_at || '',
        type: String(r.log_type || '').trim(),
        status: String(r.status || '').trim(),
        late_min: r.late_min != null ? Number(r.late_min) : undefined,
        ot_min: r.ot_min != null ? Number(r.ot_min) : undefined,
      })
    }
    list.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAttendanceList:', e)
    return NextResponse.json([], { headers })
  }
}
