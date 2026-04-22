import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { getAnnualLeaveDays, hasOneYearTenureAsOf } from '@/lib/annual-leave'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import {
  toLeaveDateStrBangkok,
  isApprovedLeaveStatus,
  getLeaveDayValueFromType,
  isAnnualLeaveFamilyType,
  leaveDateInYmdRange,
  assignLeaveRowToEmployeeForStats,
} from '@/lib/leave-request-utils'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

/** ลากิจ(태국 개인사유휴가): 연 3일 고정 */
const LAKIJ_DAYS_PER_YEAR = 3

/** 병가: 연 30일 고정 (방콕 달력년 기준 사용분 차감) */
const SICK_DAYS_PER_YEAR = 30

/** 통계용 휴가 신청 최대 로드 건수 (매장 필터·전체 공통 상한) */
const LEAVE_STATS_MAX_ROWS = 500_000

/** 통계에 올릴 직원 행 상한 */
const EMP_STATS_MAX_ROWS = 100_000

/** 휴가 통계 - 매장별 직원별 연차/병가 사용 현황 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  let storeFilter = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)

  if (storeFilter === 'All' || storeFilter === '전체') storeFilter = ''

  const isOfficeLevel = isOfficeRole(userRole) || isAccountingRole(userRole)
  if (!isOfficeLevel) {
    if (!storeFilter) {
      storeFilter = String(allowedStores[0] || '').trim()
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeFilter))
      if (!allowed) {
        return NextResponse.json([], { status: 403, headers })
      }
    }
  }

  const periodStart = /^\d{4}-\d{2}-\d{2}$/.test(startStr) ? startStr : '1900-01-01'
  const periodEnd = /^\d{4}-\d{2}-\d{2}$/.test(endStr) ? endStr : '2999-12-31'

  try {
    type EmpRow = {
      id?: number
      store?: string
      name?: string
      name_title?: string | null
      annual_leave_days?: number | null
      join_date?: string | null
      employee_code?: string | null
    }

    function normEmployeeCode(c: string | null | undefined): string {
      return String(c ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5)
    }
    type LeaveRow = {
      store?: string
      name?: string
      type?: string
      leave_date?: string
      status?: string
      employee_id?: number | null
    }

    let empRows: EmpRow[] = []
    const empSelectBase = 'id,store,name,name_title,annual_leave_days,join_date,sal_type'
    const empSelectWithCode = `${empSelectBase},employee_code`
    try {
      if (storeFilter) {
        empRows = (await supabaseSelectFilterAllPages(
          'employees',
          `store=ilike.${encodeURIComponent(storeFilter)}`,
          { order: 'id.asc', select: empSelectWithCode, pageSize: 1000, maxRows: EMP_STATS_MAX_ROWS }
        )) as EmpRow[]
      } else {
        empRows = (await supabaseSelectFilterAllPages('employees', 'id=not.is.null', {
          order: 'id.asc',
          select: empSelectWithCode,
          pageSize: 1000,
          maxRows: EMP_STATS_MAX_ROWS,
        })) as EmpRow[]
      }
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (!/employee_code|42703|column/i.test(em)) throw e
      if (storeFilter) {
        empRows = (await supabaseSelectFilterAllPages(
          'employees',
          `store=ilike.${encodeURIComponent(storeFilter)}`,
          { order: 'id.asc', select: empSelectBase, pageSize: 1000, maxRows: EMP_STATS_MAX_ROWS }
        )) as EmpRow[]
      } else {
        empRows = (await supabaseSelectFilterAllPages('employees', 'id=not.is.null', {
          order: 'id.asc',
          select: empSelectBase,
          pageSize: 1000,
          maxRows: EMP_STATS_MAX_ROWS,
        })) as EmpRow[]
      }
    }

    let leaveRows: LeaveRow[] = []
    if (storeFilter) {
      leaveRows = (await supabaseSelectFilterAllPages(
        'leave_requests',
        `store=ilike.${encodeURIComponent(storeFilter)}`,
        {
          order: 'leave_date.asc',
          select: 'store,name,type,leave_date,status,employee_id',
          pageSize: 2000,
          maxRows: LEAVE_STATS_MAX_ROWS,
        }
      )) as LeaveRow[]
    } else {
      leaveRows = (await supabaseSelectFilterAllPages('leave_requests', 'leave_date=not.is.null', {
        order: 'leave_date.asc',
        select: 'store,name,type,leave_date,status,employee_id',
        pageSize: 2000,
        maxRows: LEAVE_STATS_MAX_ROWS,
      })) as LeaveRow[]
    }

    const bangkokYear = parseInt(getBangkokTodayDateString().slice(0, 4), 10)

    const leaveAssignedEmp = (leaveRows || []).map((l) =>
      assignLeaveRowToEmployeeForStats(
        String(l.store || '').trim(),
        String(l.name || '').trim(),
        l.employee_id,
        empRows || []
      )
    )

    const result: {
      store: string
      name: string
      employeeCode: string
      usedPeriodAnnual: number
      usedPeriodSick: number
      usedPeriodUnpaid: number
      usedPeriodLakij: number
      usedTotalAnnual: number
      usedTotalSick: number
      usedTotalUnpaid: number
      usedTotalLakij: number
      remain: number
      remainLakij: number
      remainSick: number
    }[] = []

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
      let usedSickThisBangkokYear = 0

      for (let li = 0; li < (leaveRows || []).length; li++) {
        const l = leaveRows[li]
        if (leaveAssignedEmp[li] !== emp) continue

        const lStatus = String(l.status || '').trim()
        if (!isApprovedLeaveStatus(lStatus)) continue

        const lType = String(l.type || '').trim()
        const dateStr = toLeaveDateStrBangkok(l.leave_date)
        if (!dateStr) continue
        const days = getLeaveDayValueFromType(lType)
        const isAnnualType = isAnnualLeaveFamilyType(lType)
        const underOneYear = isAnnualType && !hasOneYearTenureAsOf(emp, dateStr)

        const inPeriod = leaveDateInYmdRange(dateStr, periodStart, periodEnd)

        if (lType.indexOf('무급휴가') !== -1 || lType.toLowerCase().indexOf('unpaid') !== -1 || underOneYear) {
          usedTotalUnpaid += days
          if (inPeriod) usedPeriodUnpaid += days
        } else if (lType.indexOf('ลากิจ') !== -1 || lType.toLowerCase().indexOf('lakij') !== -1) {
          usedTotalLakij += days
          if (inPeriod) usedPeriodLakij += days
        } else if (lType.indexOf('병가') !== -1 || lType.toLowerCase().indexOf('sick') !== -1) {
          usedTotalSick += days
          if (parseInt(dateStr.slice(0, 4), 10) === bangkokYear) usedSickThisBangkokYear += days
          if (inPeriod) usedPeriodSick += days
        } else {
          usedTotalAnnual += days
          if (inPeriod) usedPeriodAnnual += days
        }
      }

      result.push({
        store: empStore,
        name: empName,
        employeeCode: normEmployeeCode(emp.employee_code),
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
        remainSick: Math.max(0, Math.round((SICK_DAYS_PER_YEAR - usedSickThisBangkokYear) * 10) / 10),
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
