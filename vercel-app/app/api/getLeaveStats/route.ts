import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** 연차일 수: Hourly는 0. 직원관리 직접 입력 우선. null이면 근속연수에 따라 1년↑6일, 2년↑7일, 3년↑8일... (1년마다 +1일) */
function getAnnualLeaveDays(emp: Record<string, unknown> | null): number {
  if (!emp) return 0
  const salType = String(emp.sal_type ?? emp.salType ?? '').trim()
  if (salType.toLowerCase() === 'hourly') return 0
  const directVal = emp.annual_leave_days ?? emp.annualLeaveDays
  if (directVal != null && directVal !== '' && Number(directVal) > 0) {
    const direct = Number(directVal)
    if (!Number.isNaN(direct) && direct >= 0) return direct
  }
  const joinVal = emp.join_date ?? emp.joinDate
  if (joinVal == null || (typeof joinVal === 'string' && !joinVal.trim())) return 0
  const joinStr = typeof joinVal === 'string' || joinVal instanceof Date ? toDateStr(joinVal) : ''
  if (!joinStr) return 0
  const joinDate = new Date(joinStr + 'T12:00:00')
  if (isNaN(joinDate.getTime())) return 0
  const now = new Date()
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000
  const fullYears = Math.floor((now.getTime() - joinDate.getTime()) / msPerYear)
  if (fullYears < 1) return 0
  return 6 + (fullYears - 1)
}

/** 휴가 유형별 일수 (반차=0.5, 그 외=1) */
function getLeaveDays(type: string): number {
  const t = String(type || '').trim()
  if (t.indexOf('반차') !== -1 || t.toLowerCase().indexOf('half') !== -1) return 0.5
  return 1
}

/** ลากิจ(태국 개인사유휴가): 연 3일 고정 */
const LAKIJ_DAYS_PER_YEAR = 3

/** 휴가 통계 - 매장별 직원별 연차/병가 사용 현황 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  let storeFilter = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  if (storeFilter === 'All' || storeFilter === '전체') storeFilter = ''

  const isManager = userRole === 'manager'
  if (isManager && userStore) storeFilter = userStore

  const start = startStr ? new Date(startStr + 'T00:00:00') : new Date('2000-01-01')
  const end = endStr ? new Date(endStr + 'T23:59:59') : new Date('2100-12-31')

  try {
    type EmpRow = { store?: string; name?: string; annual_leave_days?: number | null; join_date?: string | null }
    type LeaveRow = { store?: string; name?: string; type?: string; leave_date?: string; status?: string }

    let empRows: EmpRow[] = []
    const empSelect = 'id,store,name,annual_leave_days,join_date,sal_type'
    if (storeFilter) {
      empRows = (await supabaseSelectFilter(
        'employees',
        `store=ilike.${encodeURIComponent(storeFilter)}`,
        { order: 'id.asc', select: empSelect }
      )) as EmpRow[]
    } else {
      empRows = (await supabaseSelect('employees', { order: 'id.asc', select: empSelect })) as EmpRow[]
    }

    let leaveRows: LeaveRow[] = []
    if (storeFilter) {
      leaveRows = (await supabaseSelectFilter(
        'leave_requests',
        `store=ilike.${encodeURIComponent(storeFilter)}`,
        { order: 'leave_date.asc', limit: 2000 }
      )) as LeaveRow[]
    } else {
      leaveRows = (await supabaseSelect('leave_requests', { order: 'leave_date.asc', limit: 2000 })) as LeaveRow[]
    }

    const result: { store: string; name: string; usedPeriodAnnual: number; usedPeriodSick: number; usedPeriodUnpaid: number; usedPeriodLakij: number; usedTotalAnnual: number; usedTotalSick: number; usedTotalUnpaid: number; usedTotalLakij: number; remain: number; remainLakij: number }[] = []

    for (const emp of empRows || []) {
      const empStore = String(emp.store || '').trim()
      const empName = String(emp.name || '').trim()
      if (!empName) continue

      const annualLimit = getAnnualLeaveDays(emp)
      let usedPeriodAnnual = 0
      let usedPeriodSick = 0
      let usedPeriodUnpaid = 0
      let usedPeriodLakij = 0
      let usedTotalAnnual = 0
      let usedTotalSick = 0
      let usedTotalUnpaid = 0
      let usedTotalLakij = 0

      for (const l of leaveRows || []) {
        const lName = String(l.name || '').trim()
        if (lName !== empName) continue

        const lStatus = String(l.status || '').trim()
        if (lStatus !== '승인' && lStatus !== 'Approved') continue

        const lType = String(l.type || '').trim()
        const dateStr = toDateStr(l.leave_date)
        if (!dateStr) continue
        const lDate = new Date(dateStr + 'T12:00:00')
        const days = getLeaveDays(lType)

        if (lType.indexOf('무급휴가') !== -1 || lType.toLowerCase().indexOf('unpaid') !== -1) {
          usedTotalUnpaid += days
          if (lDate >= start && lDate <= end) usedPeriodUnpaid += days
        } else if (lType.indexOf('ลากิจ') !== -1 || lType.toLowerCase().indexOf('lakij') !== -1) {
          usedTotalLakij += days
          if (lDate >= start && lDate <= end) usedPeriodLakij += days
        } else if (lType.indexOf('병가') !== -1 || lType.toLowerCase().indexOf('sick') !== -1) {
          usedTotalSick += days
          if (lDate >= start && lDate <= end) usedPeriodSick += days
        } else {
          usedTotalAnnual += days
          if (lDate >= start && lDate <= end) usedPeriodAnnual += days
        }
      }

      result.push({
        store: empStore,
        name: empName,
        usedPeriodAnnual: Math.round(usedPeriodAnnual * 10) / 10,
        usedPeriodSick: Math.round(usedPeriodSick * 10) / 10,
        usedPeriodUnpaid: Math.round(usedPeriodUnpaid * 10) / 10,
        usedPeriodLakij: Math.round(usedPeriodLakij * 10) / 10,
        usedTotalAnnual: Math.round(usedTotalAnnual * 10) / 10,
        usedTotalSick: Math.round(usedTotalSick * 10) / 10,
        usedTotalUnpaid: Math.round(usedTotalUnpaid * 10) / 10,
        usedTotalLakij: Math.round(usedTotalLakij * 10) / 10,
        remain: Math.max(0, Math.round((annualLimit - usedTotalAnnual) * 10) / 10),
        remainLakij: Math.max(0, Math.round((LAKIJ_DAYS_PER_YEAR - usedTotalLakij) * 10) / 10),
      })
    }

    result.sort((a, b) => {
      if (a.store !== b.store) return a.store.localeCompare(b.store)
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getLeaveStats:', e)
    return NextResponse.json([], { headers })
  }
}
