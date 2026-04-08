import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { normalizeEmployeeCodeForMatch } from '@/lib/employee-display-name'

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
  const employeeCodeNorm = normalizeEmployeeCodeForMatch(
    String(searchParams.get('employeeCode') || searchParams.get('code') || '').trim()
  )

  if (!startDate || !endDate || !storeFilter || !employeeFilter) {
    return NextResponse.json([], { headers })
  }

  try {
    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startDate, endDate)

    const rows = (await (async () => {
      const byNameFilter = `store_name=ilike.${encodeURIComponent(storeFilter)}&name=ilike.${encodeURIComponent(employeeFilter)}&log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(endISOExclusive)}`
      const selectColsWithCode =
        'log_at,log_type,status,late_min,ot_min,approved,employee_id,employee_code'
      const selectColsNoCode = 'log_at,log_type,status,late_min,ot_min,approved,employee_id'

      const selectLogs = async (filter: string, withCode: boolean) => {
        try {
          return (await supabaseSelectFilter('attendance_logs', filter, {
            order: 'log_at.asc',
            limit: 500,
            select: withCode ? selectColsWithCode : selectColsNoCode,
          })) as {
            log_at?: string
            log_type?: string
            status?: string
            late_min?: number
            ot_min?: number
            approved?: string | null
            employee_id?: number | null
          }[]
        } catch (e) {
          const em = e instanceof Error ? e.message : String(e)
          if (!withCode || !/employee_code|42703|column/i.test(em)) throw e
          return selectLogs(filter, false)
        }
      }

      if (employeeId > 0) {
        try {
          const byIdFilter = `store_name=ilike.${encodeURIComponent(storeFilter)}&employee_id=eq.${employeeId}&log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(endISOExclusive)}`
          const byIdRows = await selectLogs(byIdFilter, true)
          const byNameRows = await selectLogs(byNameFilter, true)
          const codeLegFilter =
            employeeCodeNorm.length > 0
              ? `store_name=ilike.${encodeURIComponent(storeFilter)}&employee_code=eq.${encodeURIComponent(employeeCodeNorm)}&employee_id=is.null&log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(endISOExclusive)}`
              : ''
          let byCodeRows: typeof byIdRows = []
          if (codeLegFilter) {
            try {
              byCodeRows = await selectLogs(codeLegFilter, true)
            } catch (e) {
              const em = e instanceof Error ? e.message : String(e)
              if (!/employee_code|42703|column/i.test(em)) throw e
            }
          }
          const merged = new Map<string, {
            log_at?: string
            log_type?: string
            status?: string
            late_min?: number
            ot_min?: number
            approved?: string | null
            employee_id?: number | null
          }>()
          const pushRow = (r: {
            log_at?: string
            log_type?: string
            status?: string
            late_min?: number
            ot_min?: number
            approved?: string | null
            employee_id?: number | null
          }) => {
            const rowEmpId =
              r.employee_id != null && Number.isFinite(Number(r.employee_id))
                ? Math.floor(Number(r.employee_id))
                : 0
            // employee_id가 다르면 다른 직원 행으로 판단하고 제외
            if (rowEmpId > 0 && rowEmpId !== employeeId) return
            const key = `${String(r.log_at || '')}|${String(r.log_type || '').trim()}|${String(r.status || '').trim()}`
            if (!merged.has(key)) merged.set(key, r)
          }
          for (const r of byIdRows || []) pushRow(r)
          for (const r of byNameRows || []) pushRow(r)
          for (const r of byCodeRows || []) pushRow(r)
          return Array.from(merged.values()).sort((a, b) => String(a.log_at || '').localeCompare(String(b.log_at || '')))
        } catch (e) {
          const em = e instanceof Error ? e.message : String(e)
          if (!/employee_id|42703|column/i.test(em)) throw e
        }
      }
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
      employee_id?: number | null
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
