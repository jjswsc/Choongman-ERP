import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { buildVisitDisplayNameMap, visitDisplayName } from '@/lib/visit-display-name'
import { addDayBangkok, visitRowBusinessDateStrBangkok } from '@/lib/attendance-utils'

/** 매장 방문 통계: 부서별/직원별/매장별 투입 시간(분) */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('start') || searchParams.get('startStr') || '2000-01-01').slice(0, 10)
  const endStr = String(searchParams.get('end') || searchParams.get('endStr') || '2100-12-31').slice(0, 10)

  try {
    const vMin = addDayBangkok(startStr, -1)
    const vMax = addDayBangkok(endStr, 1)
    const rangeFilter = `visit_date=gte.${vMin}&visit_date=lte.${vMax}&or=(visit_type.eq.${encodeURIComponent('방문종료')},visit_type.eq.${encodeURIComponent('강제 방문종료')},duration_min.gt.0)`
    let visitData: { name?: string; store_name?: string; purpose?: string; duration_min?: number; visit_date?: string; visit_time?: string; created_at?: string }[] = []
    try {
      visitData = (await supabaseSelectFilter('store_visits', rangeFilter, {
        order: 'visit_date',
        limit: 2000,
        select: 'name,store_name,purpose,duration_min,visit_date,visit_time,created_at',
      })) as typeof visitData
    } catch {
      const fallbackFilter = `visit_date=gte.${vMin}&or=(visit_type.eq.${encodeURIComponent('방문종료')},visit_type.eq.${encodeURIComponent('강제 방문종료')},duration_min.gt.0)`
      const fallback = (await supabaseSelectFilter('store_visits', fallbackFilter, {
        order: 'visit_date',
        limit: 2000,
        select: 'name,store_name,purpose,duration_min,visit_date,visit_time,created_at',
      })) as typeof visitData
      visitData = (fallback || []).filter((d) => {
        const bd = visitRowBusinessDateStrBangkok(d)
        return bd >= startStr && bd <= endStr
      })
    }

    visitData = (visitData || []).filter((d) => {
      const bd = visitRowBusinessDateStrBangkok(d)
      return bd >= startStr && bd <= endStr
    })

    const nameToDeptRaw: Record<string, string> = {}
    const empList = (await supabaseSelect('employees', { order: 'id.asc', select: 'store,job,nick,name', limit: 2000 })) as { store?: string; job?: string; nick?: string; name?: string }[] || []
    const displayMap = buildVisitDisplayNameMap(empList)
    for (const e of empList) {
      const rowDept = String(e.job || '').trim() || 'Staff'
      const nick = String(e.nick || '').trim()
      const legal = String(e.name || '').trim()
      if (nick) nameToDeptRaw[nick] = rowDept
      if (legal) nameToDeptRaw[legal] = rowDept
    }

    const byDeptMap: Record<string, number> = {}
    const byEmployeeMap: Record<string, number> = {}
    const byStoreMap: Record<string, number> = {}
    const byPurposeMap: Record<string, number> = {}

    for (const d of visitData || []) {
      const raw = d as { duration_min?: number | string }
      const duration = Math.max(0, Math.floor(Number(raw?.duration_min ?? 0)) || 0)
      const rawName = String(d.name || '').trim()
      const displayName = visitDisplayName(rawName, displayMap)
      const store = String(d.store_name || '').trim()
      const purpose = String(d.purpose || '').trim() || '기타'
      const dept = nameToDeptRaw[rawName] || '기타'
      byEmployeeMap[displayName] = (byEmployeeMap[displayName] || 0) + duration
      byStoreMap[store] = (byStoreMap[store] || 0) + duration
      byDeptMap[dept] = (byDeptMap[dept] || 0) + duration
      byPurposeMap[purpose] = (byPurposeMap[purpose] || 0) + duration
    }

    const byDept = Object.entries(byDeptMap)
      .map(([label, minutes]) => ({ label, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
    const byEmployee = Object.entries(byEmployeeMap)
      .map(([label, minutes]) => ({ label, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
    const byStore = Object.entries(byStoreMap)
      .map(([label, minutes]) => ({ label, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
    const byPurpose = Object.entries(byPurposeMap)
      .map(([label, minutes]) => ({ label, minutes }))
      .sort((a, b) => b.minutes - a.minutes)

    return NextResponse.json({ byDept, byEmployee, byStore, byPurpose })
  } catch (e) {
    console.error('getStoreVisitStats:', e)
    return NextResponse.json({ byDept: [], byEmployee: [], byStore: [], byPurpose: [] }, { status: 500 })
  }
}
