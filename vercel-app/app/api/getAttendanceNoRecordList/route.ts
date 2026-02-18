import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'

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
    type SchRow = { schedule_date?: string; store_name?: string; name?: string; plan_in?: string; plan_out?: string; break_start?: string; break_end?: string; plan_in_prev_day?: boolean }
    const schFilter = `schedule_date=gte.${startStr}&schedule_date=lte.${endStr}`
    let schRows: SchRow[] = []
    if (isAllStores) {
      schRows = (await supabaseSelectFilter('schedules', schFilter, { order: 'schedule_date.asc', limit: 1000 })) as SchRow[]
    } else {
      const f = `${schFilter}&store_name=ilike.${encodeURIComponent(storeFilter)}`
      schRows = (await supabaseSelectFilter('schedules', f, { order: 'schedule_date.asc', limit: 1000 })) as SchRow[]
    }

    // 출근이 있는 날짜|매장|이름 키 수집
    const endD = new Date(endStr + 'T23:59:59')
    endD.setDate(endD.getDate() + 1)
    const endExclusive = endD.toISOString().slice(0, 10)
    type AttRow = { log_at?: string; store_name?: string; name?: string; log_type?: string }
    const attFilter = isAllStores
      ? `log_at=gte.${startStr}&log_at=lt.${endExclusive}`
      : `store_name=ilike.${encodeURIComponent(storeFilter)}&log_at=gte.${startStr}&log_at=lt.${endExclusive}`
    const attRows = (await supabaseSelectFilter('attendance_logs', attFilter, { order: 'log_at.asc', limit: 2000 })) as AttRow[]

    const hasAttendance = new Set<string>()
    for (const r of attRows || []) {
      const dt = toDateStr(r.log_at)
      const store = String(r.store_name || '').trim()
      const name = String(r.name || '').trim()
      const type = String(r.log_type || '').trim()
      if (dt && store && name && (type === '출근' || type === '퇴근')) {
        hasAttendance.add(`${dt}|${store}|${name}`)
      }
    }

    const nickMap: Record<string, string> = {}
    const empList = (await supabaseSelect('employees', { order: 'id.asc', limit: 500, select: 'store,name,nick' })) as { store?: string; name?: string; nick?: string }[] | null
    for (const e of empList || []) {
      const s = String(e.store || '').trim()
      const n = String(e.name || '').trim()
      if (s && n) nickMap[s + '|' + n] = String(e.nick || '').trim()
    }

    const result: AttendanceNoRecordRow[] = []
    for (const s of schRows || []) {
      const date = toDateStr(s.schedule_date)
      if (!date || date < startStr || date > endStr) continue
      const store = String(s.store_name || '').trim()
      const name = String(s.name || '').trim()
      if (!store || !name) continue
      const key = `${date}|${store}|${name}`
      if (hasAttendance.has(key)) continue

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
        nick: nickMap[store + '|' + name] || '',
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
