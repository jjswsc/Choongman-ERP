import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** dateFilterType: 'request' = 신청일 기준, 'leave' = 휴가일 기준 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  let store = String(searchParams.get('store') || '').trim()
  const status = String(searchParams.get('status') || '대기').trim()
  const typeFilter = String(searchParams.get('type') || searchParams.get('typeFilter') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()
  const dateFilterType = String(searchParams.get('dateFilterType') || 'leave').trim() as 'request' | 'leave'

  if (store === 'undefined' || store === 'null') store = ''
  if (store === 'All') store = ''

  const isManager = userRole === 'manager'
  if (isManager && userStore) store = userStore

  try {
    let rows: { id: number; store?: string; name?: string; type?: string; leave_date?: string; request_at?: string; created_at?: string; reason?: string; status?: string; certificate_url?: string }[] = []

    if (store) {
      const filter = `store=ilike.${encodeURIComponent(store)}`
      rows = (await supabaseSelectFilter('leave_requests', filter, { order: 'leave_date.desc', limit: 500 })) as typeof rows
    } else {
      rows = (await supabaseSelect('leave_requests', { order: 'leave_date.desc', limit: 500 })) as typeof rows
    }

    const nickMap: Record<string, string> = {}
    const empList = (await supabaseSelect('employees', { order: 'id.asc', select: 'store,name,nick' })) as { store?: string; name?: string; nick?: string }[] || []
    for (const e of empList) {
      const s = String(e.store || '').trim()
      const n = String(e.name || '').trim()
      if (s && n) nickMap[s + '|' + n] = String(e.nick || '').trim()
    }

    const list: { id: number; store: string; name: string; nick: string; type: string; date: string; requestDate: string; reason: string; status: string; certificateUrl: string }[] = []

    for (const r of rows || []) {
      const rowStatus = String(r.status || '').trim()
      if (status !== 'All' && status !== '전체' && rowStatus !== status) continue

      const rowType = String(r.type || '').trim()
      if (typeFilter && typeFilter !== 'All' && typeFilter !== '전체' && rowType !== typeFilter) continue

      const dateStr = toDateStr(r.leave_date)
      const requestDateStr = toDateStr(r.request_at || r.created_at)

      const filterBy = dateFilterType === 'request' ? requestDateStr : dateStr
      if (startStr && filterBy < startStr) continue
      if (endStr && filterBy > endStr) continue

      list.push({
        id: r.id,
        store: String(r.store || '').trim(),
        name: String(r.name || '').trim(),
        nick: nickMap[String(r.store || '') + '|' + String(r.name || '')] || '',
        type: String(r.type || '').trim(),
        date: dateStr,
        requestDate: requestDateStr,
        reason: String(r.reason || '').trim(),
        status: rowStatus,
        certificateUrl: String(r.certificate_url || '').trim(),
      })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getLeavePendingList:', e)
    return NextResponse.json([], { headers })
  }
}
