import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect, supabaseSelectFilterAllPages } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function formatTime(v: string | null | undefined): string {
  if (v == null || (typeof v === 'string' && !v.trim())) return ''
  const s = String(v).trim()
  const match = s.match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (match) return ('0' + match[1]).slice(-2) + ':' + ('0' + match[2]).slice(-2)
  return s
}

export interface AttendanceNoRecordRow {
  date: string
  store: string
  name: string
  employeeId?: number
  employeeCode?: string
  nick?: string
  inTimeStr: string
  outTimeStr: string
  breakMin: number
  planIn: string
  planOut: string
  breakStart: string
  breakEnd: string
  planInPrevDay?: boolean
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim().slice(0, 10)
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  let storeFilter = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  if (!startStr || !endStr || startStr.length < 10 || endStr.length < 10) {
    return NextResponse.json([], { headers })
  }

  const isManager = userRole === 'manager'
  if (isManager && userStore) storeFilter = userStore

  const isAllStores = !storeFilter || storeFilter === 'All' || storeFilter.toLowerCase() === 'all' || storeFilter === '전체'

  try {
    type SchRow = {
      schedule_date?: string
      store_name?: string
      name?: string
      employee_id?: number | null
      plan_in?: string
      plan_out?: string
      break_start?: string
      break_end?: string
      plan_in_prev_day?: boolean
    }
    const schFilter = `schedule_date=gte.${startStr}&schedule_date=lte.${endStr}`
    let schRows: SchRow[] = []
    if (isAllStores) {
      schRows = (await supabaseSelectFilterAllPages('schedules', schFilter, {
        order: 'schedule_date.asc',
        pageSize: 8000,
        maxRows: 2_000_000,
      })) as SchRow[]
    } else {
      const f = `${schFilter}&store_name=ilike.${encodeURIComponent(storeFilter)}`
      schRows = (await supabaseSelectFilterAllPages('schedules', f, {
        order: 'schedule_date.asc',
        pageSize: 8000,
        maxRows: 2_000_000,
      })) as SchRow[]
    }

    // 출근이 있는 날짜|매장|직원 키 수집
    const endD = new Date(endStr + 'T23:59:59')
    endD.setDate(endD.getDate() + 1)
    const endExclusive = endD.toISOString().slice(0, 10)
    type AttRow = { log_at?: string; store_name?: string; name?: string; employee_id?: number | null; log_type?: string }
    const attFilter = isAllStores
      ? `log_at=gte.${startStr}&log_at=lt.${endExclusive}`
      : `store_name=ilike.${encodeURIComponent(storeFilter)}&log_at=gte.${startStr}&log_at=lt.${endExclusive}`
    const attRows = (await (async () => {
      try {
        return await supabaseSelectFilter('attendance_logs', attFilter, {
          order: 'log_at.asc',
          limit: 2000,
          select: 'log_at,store_name,name,employee_id,log_type',
        })
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (!/employee_id|42703|column/i.test(em)) throw e
        return await supabaseSelectFilter('attendance_logs', attFilter, {
          order: 'log_at.asc',
          limit: 2000,
          select: 'log_at,store_name,name,log_type',
        })
      }
    })()) as AttRow[]

    const hasAttendance = new Set<string>()
    for (const r of attRows || []) {
      const dt = toDateStr(r.log_at)
      const store = String(r.store_name || '').trim()
      const name = String(r.name || '').trim()
      const type = String(r.log_type || '').trim()
      if (dt && store && name && (type === '출근' || type === '퇴근')) {
        const sid = r.employee_id != null && Number.isFinite(Number(r.employee_id)) ? Math.floor(Number(r.employee_id)) : 0
        if (sid > 0) hasAttendance.add(`${dt}|${store}|#${sid}`)
        hasAttendance.add(`${dt}|${store}|${name}`)
      }
    }

    // 승인된 휴가(연차/병가/무급휴가 등)가 있는 날짜·매장·직원은 미기록 목록에서 제외
    const leaveFilter = `leave_date=gte.${startStr}&leave_date=lte.${endStr}`
    const leaveRows = (await (async () => {
      try {
        return await supabaseSelectFilter(
          'leave_requests',
          leaveFilter,
          { limit: 1000, select: 'store,name,leave_date,status,employee_id' }
        )
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (!/employee_id|42703|column/i.test(em)) throw e
        return await supabaseSelectFilter(
          'leave_requests',
          leaveFilter,
          { limit: 1000, select: 'store,name,leave_date,status' }
        )
      }
    })()) as { store?: string; name?: string; leave_date?: string; status?: string; employee_id?: number | null }[]
    const hasApprovedLeave = new Set<string>()
    for (const lr of leaveRows || []) {
      if (String(lr.status || '').trim() !== '승인') continue
      const store = String(lr.store || '').trim()
      const name = String(lr.name || '').trim()
      const date = toDateStr(lr.leave_date)
      if (date && store && name && date >= startStr && date <= endStr) {
        const sid = lr.employee_id != null && Number.isFinite(Number(lr.employee_id)) ? Math.floor(Number(lr.employee_id)) : 0
        if (sid > 0) hasApprovedLeave.add(`${date}|${store}|#${sid}`)
        hasApprovedLeave.add(`${date}|${store}|${name}`)
      }
    }

    const nickMap: Record<string, string> = {}
    const nickById: Record<number, string> = {}
    const codeById: Record<number, string> = {}
    const empList = (await supabaseSelect('employees', {
      order: 'id.asc',
      limit: 5000,
      select: 'id,store,name,nick,employee_code',
    })) as { id?: number; store?: string; name?: string; nick?: string; employee_code?: string | null }[] | null
    for (const e of empList || []) {
      const s = String(e.store || '').trim()
      const n = String(e.name || '').trim()
      if (s && n) nickMap[s + '|' + n] = String(e.nick || '').trim()
      const sid = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
      if (sid > 0) {
        nickById[sid] = String(e.nick || '').trim()
        codeById[sid] = String(e.employee_code || '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 5)
      }
    }

    const result: AttendanceNoRecordRow[] = []
    for (const s of schRows || []) {
      const date = toDateStr(s.schedule_date)
      if (!date || date < startStr || date > endStr) continue
      const store = String(s.store_name || '').trim()
      const name = String(s.name || '').trim()
      if (!store || !name) continue
      const sid = s.employee_id != null && Number.isFinite(Number(s.employee_id)) ? Math.floor(Number(s.employee_id)) : 0
      const key = sid > 0 ? `${date}|${store}|#${sid}` : `${date}|${store}|${name}`
      if (hasAttendance.has(key)) continue
      if (hasApprovedLeave.has(key)) continue // 휴가일은 미기록 목록에서 제외

      const planIn = formatTime(s.plan_in) || '09:00'
      const planOut = formatTime(s.plan_out) || '18:00'
      const planBS = formatTime(s.break_start)
      const planBE = formatTime(s.break_end)
      let breakMin = 0
      if (planBS && planBE) {
        const [bh, bm] = planBS.split(':').map(Number)
        const [eh, em] = planBE.split(':').map(Number)
        breakMin = Math.max(0, (eh * 60 + em) - (bh * 60 + bm))
      }

      result.push({
        date,
        store,
        name,
        ...(sid > 0 ? { employeeId: sid } : {}),
        ...(() => {
          const c = sid > 0 ? String(codeById[sid] || '').trim() : ''
          return c ? { employeeCode: c } : {}
        })(),
        nick: (sid > 0 ? nickById[sid] : '') || nickMap[store + '|' + name] || '',
        inTimeStr: planIn,
        outTimeStr: planOut,
        breakMin,
        planIn,
        planOut,
        breakStart: planBS,
        breakEnd: planBE,
        planInPrevDay: !!s.plan_in_prev_day,
      })
    }

    result.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      if (a.store !== b.store) return a.store.localeCompare(b.store)
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getAttendanceNoRecordList:', e)
    return NextResponse.json([], { headers })
  }
}
