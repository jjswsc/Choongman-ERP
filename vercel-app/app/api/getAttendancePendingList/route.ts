import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 19).replace('T', ' ')
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 19).replace('T', ' ')
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
    type Row = { id: number; log_at?: string; store_name?: string; name?: string; log_type?: string; status?: string; approved?: string; late_min?: number; ot_min?: number }
    let rows: Row[] = []

    if (store && store !== 'All' && store !== '전체') {
      const filter = `store_name=ilike.${encodeURIComponent(store)}&approved=eq.대기`
      rows = (await supabaseSelectFilter('attendance_logs', filter, { order: 'log_at.desc', limit: 500 })) as Row[]
    } else {
      const filter = 'approved=eq.대기'
      rows = (await supabaseSelectFilter('attendance_logs', filter, { order: 'log_at.desc', limit: 500 })) as Row[]
    }

    const nickMap: Record<string, string> = {}
    const empList = (await supabaseSelect('employees', { order: 'id.asc', limit: 500, select: 'store,name,nick' })) as { store?: string; name?: string; nick?: string }[] | null
    for (const e of empList || []) {
      const s = String(e.store || '').trim()
      const n = String(e.name || '').trim()
      if (s && n) nickMap[s + '|' + n] = String(e.nick || '').trim()
    }

    const list: { id: number; log_at: string; store_name: string; name: string; nick?: string; log_type: string; status?: string; approved?: string; late_min?: number; ot_min?: number }[] = []

    for (const r of rows || []) {
      const rowDate = toDateStr(r.log_at).slice(0, 10)
      if (startStr && rowDate < startStr) continue
      if (endStr && rowDate > endStr) continue

      const rowStore = String(r.store_name || '').trim()
      const rowName = String(r.name || '').trim()
      list.push({
        id: r.id,
        log_at: toDateStr(r.log_at),
        store_name: rowStore,
        name: rowName,
        nick: nickMap[rowStore + '|' + rowName] || '',
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
