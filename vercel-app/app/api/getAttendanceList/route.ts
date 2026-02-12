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
    const filter = `store_name=ilike.${encodeURIComponent(storeFilter)}&name=ilike.${encodeURIComponent(employeeFilter)}`
    const rows = (await supabaseSelectFilter(
      'attendance_logs',
      filter,
      { order: 'log_at.desc', limit: 100 }
    )) as { log_at?: string; log_type?: string; status?: string }[]

    const startD = new Date(startDate)
    startD.setHours(0, 0, 0, 0)
    const endD = new Date(endDate)
    endD.setHours(23, 59, 59, 999)

    const list: { timestamp: string; type: string; status: string }[] = []
    for (const r of rows || []) {
      const rowDate = new Date(r.log_at || '')
      if (isNaN(rowDate.getTime()) || rowDate < startD || rowDate > endD) continue
      list.push({
        timestamp: r.log_at || '',
        type: String(r.log_type || '').trim(),
        status: String(r.status || '').trim(),
      })
    }
    list.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAttendanceList:', e)
    return NextResponse.json([], { headers })
  }
}
