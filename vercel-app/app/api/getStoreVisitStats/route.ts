import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** 매장 방문 통계: 부서별/직원별/매장별 투입 시간(분) */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('start') || searchParams.get('startStr') || '2000-01-01').slice(0, 10)
  const endStr = String(searchParams.get('end') || searchParams.get('endStr') || '2100-12-31').slice(0, 10)

  try {
    const visitData = (await supabaseSelectFilter('store_visits', `visit_date=gte.${startStr}&visit_date=lte.${endStr}`, {
      order: 'visit_date',
      limit: 2000,
    })) as { name?: string; store_name?: string; purpose?: string; duration_min?: number }[]

    const nameToDept: Record<string, string> = {}
    const empList = (await supabaseSelect('employees', { order: 'id.asc' })) as { store?: string; job?: string; nick?: string; name?: string }[] || []
    for (const e of empList) {
      const st = String(e.store || '').toLowerCase()
      if (st.indexOf('office') === -1 && st !== '본사' && st !== '오피스') continue
      const rowDept = String(e.job || '').trim() || 'Staff'
      const nameToShow = String(e.nick || '').trim() || String(e.name || '').trim()
      if (nameToShow) nameToDept[nameToShow] = rowDept
    }

    const byDeptMap: Record<string, number> = {}
    const byEmployeeMap: Record<string, number> = {}
    const byStoreMap: Record<string, number> = {}
    const byPurposeMap: Record<string, number> = {}

    for (const d of visitData || []) {
      const duration = Number(d.duration_min) || 0
      if (duration <= 0) continue
      const name = String(d.name || '').trim()
      const store = String(d.store_name || '').trim()
      const purpose = String(d.purpose || '').trim() || '기타'
      const dept = nameToDept[name] || '기타'
      byEmployeeMap[name] = (byEmployeeMap[name] || 0) + duration
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
