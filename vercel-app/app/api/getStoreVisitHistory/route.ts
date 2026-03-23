import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  buildVisitDisplayNameMap,
  visitDisplayName,
  visitNameSupabaseFilter,
  visitNameVariantsForFilter,
} from '@/lib/visit-display-name'
import { addDayBangkok, visitRowBusinessDateStrBangkok } from '@/lib/attendance-utils'

function fmtTime(visitTime: string | null | undefined, createdAt?: string | null): string {
  const t = String(visitTime != null ? visitTime : '').trim()
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
  const purposeFilter = searchParams.get('purpose')?.trim()

  const storeFilter = store === 'All' || !store ? 'All' : store
  const empFilter = employeeName === 'All' || !employeeName ? 'All' : employeeName
  const deptFilter = department === 'All' || !department ? null : department

  const empList = ((await supabaseSelect('employees', { order: 'id.asc', select: 'store,job,nick,name', limit: 2000 })) as
    { store?: string; job?: string; nick?: string; name?: string }[]) || []
  const displayMap = buildVisitDisplayNameMap(empList)

  const namesInDept: string[] = []
  if (deptFilter) {
    for (const e of empList) {
      const st = String(e.store || '').toLowerCase()
      if (st.indexOf('office') === -1 && st !== '본사' && st !== '오피스') continue
      const rowDept = String(e.job || '').trim() || 'Staff'
      if (rowDept !== deptFilter) continue
      const nick = String(e.nick || '').trim()
      const legal = String(e.name || '').trim()
      if (nick && !namesInDept.includes(nick)) namesInDept.push(nick)
      if (legal && !namesInDept.includes(legal)) namesInDept.push(legal)
    }
  }

  const visitDateMin = addDayBangkok(startStr, -1)
  const visitDateMax = addDayBangkok(endStr, 1)
  const filters = [`visit_date=gte.${visitDateMin}`, `visit_date=lte.${visitDateMax}`]
  if (storeFilter !== 'All') filters.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)
  if (empFilter !== 'All') {
    const nameF = visitNameSupabaseFilter(visitNameVariantsForFilter(empFilter, empList))
    if (nameF) filters.push(nameF)
  }
  if (purposeFilter) {
    if (purposeFilter === '기타') {
      filters.push(`or=(purpose.eq.${encodeURIComponent('기타')},purpose.like.${encodeURIComponent('기타:*')})`)
    } else {
      filters.push(`purpose=eq.${encodeURIComponent(purposeFilter)}`)
    }
  }

  try {
    const list = (await supabaseSelectFilter('store_visits', filters.join('&'), {
      order: 'visit_date.desc,visit_time.desc',
      limit: 2000,
    })) as { visit_date?: string; visit_time?: string; name?: string; store_name?: string; visit_type?: string; purpose?: string; duration_min?: number; created_at?: string }[]

    const result = (list || [])
      .filter((d) => !deptFilter || namesInDept.length === 0 || namesInDept.includes(String(d.name || '').trim()))
      .filter((d) => {
        const bd = visitRowBusinessDateStrBangkok(d as { visit_date?: string; visit_time?: string; created_at?: string })
        return bd >= startStr && bd <= endStr
      })
      .map((d) => {
        const raw = d as { visit_time?: string; created_at?: string; duration_min?: number | string }
        const durationVal = raw.duration_min
        const durationNum = durationVal != null ? (typeof durationVal === 'number' ? durationVal : Math.floor(Number(durationVal)) || 0) : 0
        const rawName = String(d.name || '').trim()
        return {
          date: visitRowBusinessDateStrBangkok(d as { visit_date?: string; visit_time?: string; created_at?: string }),
          time: fmtTime(raw.visit_time, raw.created_at),
          name: visitDisplayName(rawName, displayMap),
          store: d.store_name,
          type: d.visit_type,
          purpose: d.purpose,
          duration: durationNum,
        }
      })

    return NextResponse.json(result)
  } catch (e) {
    console.error('getStoreVisitHistory:', e)
    return NextResponse.json([], { status: 500 })
  }
}
