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

  // 매장 매니저는 자기 매장만 조회
  const isManager = userRole === 'manager'
  if (isManager && userStore) store = userStore

  try {
    let rows: { id: number; log_at?: string; store_name?: string; name?: string; log_type?: string; status?: string; approved?: string }[] = []

    if (store && store !== 'All') {
      const filter = `store_name=ilike.${encodeURIComponent(store)}&approved=eq.대기`
      rows = (await supabaseSelectFilter('attendance_logs', filter, { order: 'log_at.desc', limit: 500 })) as typeof rows
    } else {
      const filter = 'approved=eq.대기'
      rows = (await supabaseSelectFilter('attendance_logs', filter, { order: 'log_at.desc', limit: 500 })) as typeof rows
    }

    const list: { id: number; log_at: string; store_name: string; name: string; log_type: string; status?: string; approved?: string }[] = []

    for (const r of rows || []) {
      const rowDate = toDateStr(r.log_at).slice(0, 10)
      if (startStr && rowDate < startStr) continue
      if (endStr && rowDate > endStr) continue

      list.push({
        id: r.id,
        log_at: toDateStr(r.log_at),
        store_name: String(r.store_name || '').trim(),
        name: String(r.name || '').trim(),
        log_type: String(r.log_type || '').trim(),
        status: r.status,
        approved: r.approved,
      })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAttendancePendingList:', e)
    return NextResponse.json([], { headers })
  }
}
