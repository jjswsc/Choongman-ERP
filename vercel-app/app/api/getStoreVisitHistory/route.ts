import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

function fmtTime(visitTime: string | null | undefined, createdAt?: string | null): string {
  let t = String(visitTime != null ? visitTime : '').trim()
  if (t.length >= 5) {
    if (t.indexOf('T') >= 0) {
      const iso = t.substring(t.indexOf('T') + 1)
      return iso.length >= 5 ? iso.substring(0, 5) : iso.substring(0, 8)
    }
    return t.length >= 8 ? t.substring(0, 5) : t.substring(0, 5)
  }
  if (createdAt) {
    const isoStr = typeof createdAt === 'string' ? createdAt : ''
    if (isoStr && isoStr.indexOf('T') >= 0) {
      const timePart = isoStr.substring(isoStr.indexOf('T') + 1)
      return timePart.length >= 5 ? timePart.substring(0, 5) : timePart.substring(0, 8)
    }
  }
  return ''
}

/** 관리자용 방문 기록 조회 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('start') || searchParams.get('startStr') || '2000-01-01').slice(0, 10)
  const endStr = String(searchParams.get('end') || searchParams.get('endStr') || '2100-12-31').slice(0, 10)
  const store = searchParams.get('store')?.trim()
  const employeeName = searchParams.get('employeeName')?.trim()
  const department = searchParams.get('department')?.trim()

  const storeFilter = store === 'All' || !store ? 'All' : store
  const empFilter = employeeName === 'All' || !employeeName ? 'All' : employeeName
  const deptFilter = department === 'All' || !department ? null : department

  let namesInDept: string[] = []
  if (deptFilter) {
    const empList = (await supabaseSelect('employees', { order: 'id.asc' })) as { store?: string; job?: string; nick?: string; name?: string }[] || []
    for (const e of empList) {
      const st = String(e.store || '').toLowerCase()
      if (st.indexOf('office') === -1 && st !== '본사' && st !== '오피스') continue
      const rowDept = String(e.job || '').trim() || 'Staff'
      if (rowDept !== deptFilter) continue
      const n = (String(e.nick || '').trim() || String(e.name || '').trim())
      if (n && !namesInDept.includes(n)) namesInDept.push(n)
    }
  }

  const filters = [`visit_date=gte.${startStr}`, `visit_date=lte.${endStr}`]
  if (storeFilter !== 'All') filters.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)
  if (empFilter !== 'All') filters.push(`name=eq.${encodeURIComponent(empFilter)}`)

  try {
    const list = (await supabaseSelectFilter('store_visits', filters.join('&'), {
      order: 'visit_date.desc,visit_time.desc',
      limit: 2000,
    })) as { visit_date?: string; visit_time?: string; name?: string; store_name?: string; visit_type?: string; purpose?: string; duration_min?: number; created_at?: string }[]

    const result = (list || [])
      .filter((d) => !deptFilter || namesInDept.length === 0 || namesInDept.includes(String(d.name || '').trim()))
      .map((d) => ({
        date: String(d.visit_date || '').slice(0, 10),
        time: fmtTime(d.visit_time, d.created_at),
        name: d.name,
        store: d.store_name,
        type: d.visit_type,
        purpose: d.purpose,
        duration: d.duration_min,
      }))

    return NextResponse.json(result)
  } catch (e) {
    console.error('getStoreVisitHistory:', e)
    return NextResponse.json([], { status: 500 })
  }
}
