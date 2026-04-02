import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

const TZ = 'Asia/Bangkok'

/** log_at(UTC ISO) → 방콕 기준 날짜 YYYY-MM-DD (필터용) */
function toDateStrBangkok(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** log_at(UTC ISO) → 방콕 기준 표시 "YYYY-MM-DD HH:mm:ss" */
function toDisplayStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = new Date(val)
  if (isNaN(d.getTime())) return ''
  const datePart = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const timePart = d.toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return `${datePart} ${timePart}`
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  let store = String(searchParams.get('store') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()
  if (store === 'null' || store === 'undefined') store = ''

  // 매장 매니저는 자기 매장만 조회
  const isManager = userRole === 'manager'
  if (isManager && userStore) store = userStore

  try {
    type Row = {
      id: number
      log_at?: string
      store_name?: string
      name?: string
      employee_id?: number | null
      log_type?: string
      status?: string
      approved?: string
      late_min?: number
      ot_min?: number
    }
    let rows: Row[] = []

    if (store && store !== 'All' && store !== '전체') {
      const filter = `store_name=ilike.${encodeURIComponent(store)}&approved=eq.대기`
      rows = (await supabaseSelectFilter('attendance_logs', filter, {
        order: 'log_at.desc',
        limit: 500,
        select: 'id,log_at,store_name,name,employee_id,log_type,status,approved,late_min,ot_min',
      })) as Row[]
    } else {
      const filter = 'approved=eq.대기'
      rows = (await supabaseSelectFilter('attendance_logs', filter, {
        order: 'log_at.desc',
        limit: 500,
        select: 'id,log_at,store_name,name,employee_id,log_type,status,approved,late_min,ot_min',
      })) as Row[]
    }

    const nickMap: Record<string, string> = {}
    const nickById: Record<number, string> = {}
    const empList = (await supabaseSelect('employees', { order: 'id.asc', limit: 500, select: 'id,store,name,nick' })) as {
      id?: number
      store?: string
      name?: string
      nick?: string
    }[] | null
    for (const e of empList || []) {
      const s = String(e.store || '').trim()
      const n = String(e.name || '').trim()
      if (s && n) nickMap[s + '|' + n] = String(e.nick || '').trim()
      const eid = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
      if (eid > 0) nickById[eid] = String(e.nick || '').trim()
    }

    const list: {
      id: number
      log_at: string
      store_name: string
      name: string
      employee_id?: number
      nick?: string
      log_type: string
      status?: string
      approved?: string
      late_min?: number
      ot_min?: number
    }[] = []

    for (const r of rows || []) {
      const rowDate = toDateStrBangkok(r.log_at)
      if (startStr && rowDate < startStr) continue
      if (endStr && rowDate > endStr) continue

      const rowStore = String(r.store_name || '').trim()
      const rowName = String(r.name || '').trim()
      const eid = r.employee_id != null && Number.isFinite(Number(r.employee_id)) ? Math.floor(Number(r.employee_id)) : 0
      list.push({
        id: r.id,
        log_at: toDisplayStr(r.log_at),
        store_name: rowStore,
        name: rowName,
        ...(eid > 0 ? { employee_id: eid } : {}),
        nick: (eid > 0 ? nickById[eid] : '') || nickMap[rowStore + '|' + rowName] || '',
        log_type: String(r.log_type || '').trim(),
        status: r.status,
        approved: r.approved,
        late_min: r.late_min != null ? Number(r.late_min) : 0,
        ot_min: r.ot_min != null ? Number(r.ot_min) : 0,
      })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAttendancePendingList:', e)
    return NextResponse.json([], { headers })
  }
}
