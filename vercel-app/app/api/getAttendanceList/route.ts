import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startDate = String(searchParams.get('startDate') || searchParams.get('start') || '').trim()
  const endDate = String(searchParams.get('endDate') || searchParams.get('end') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const employeeFilter = String(searchParams.get('employeeFilter') || searchParams.get('name') || '').trim()
  const employeeIdRaw = String(searchParams.get('employeeId') || '').trim()
  const employeeId =
    employeeIdRaw && Number.isFinite(Number(employeeIdRaw)) ? Math.floor(Number(employeeIdRaw)) : 0

  if (!startDate || !endDate || !storeFilter || !employeeFilter) {
    return NextResponse.json([], { headers })
  }

  try {
    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startDate, endDate)

    const rows = (await (async () => {
      if (employeeId > 0) {
        try {
          const byIdFilter = `store_name=ilike.${encodeURIComponent(storeFilter)}&employee_id=eq.${employeeId}&log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(endISOExclusive)}`
          return await supabaseSelectFilter('attendance_logs', byIdFilter, {
            order: 'log_at.asc',
            limit: 500,
            select: 'log_at,log_type,status,late_min,ot_min,approved',
          })
        } catch (e) {
          const em = e instanceof Error ? e.message : String(e)
          if (!/employee_id|42703|column/i.test(em)) throw e
        }
      }
      const byNameFilter = `store_name=ilike.${encodeURIComponent(storeFilter)}&name=ilike.${encodeURIComponent(employeeFilter)}&log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(endISOExclusive)}`
      return await supabaseSelectFilter('attendance_logs', byNameFilter, {
        order: 'log_at.asc',
        limit: 500,
        select: 'log_at,log_type,status,late_min,ot_min,approved',
      })
    })()) as {
      log_at?: string
      log_type?: string
      status?: string
      late_min?: number
      ot_min?: number
      approved?: string | null
    }[]

    const list: { timestamp: string; type: string; status: string; late_min?: number; ot_min?: number; approved?: string }[] = []
    for (const r of rows || []) {
      list.push({
        timestamp: r.log_at || '',
        type: String(r.log_type || '').trim(),
        status: String(r.status || '').trim(),
        late_min: r.late_min != null ? Number(r.late_min) : undefined,
        ot_min: r.ot_min != null ? Number(r.ot_min) : undefined,
        approved: String(r.approved ?? '').trim() || undefined,
      })
    }
    list.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAttendanceList:', e)
    return NextResponse.json([], { headers })
  }
}
