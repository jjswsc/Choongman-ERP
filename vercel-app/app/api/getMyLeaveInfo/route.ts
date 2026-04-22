import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { getAnnualLeaveDays, hasOneYearTenureAsOf } from '@/lib/annual-leave'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'
import {
  toLeaveDateStrBangkok,
  isApprovedLeaveStatus,
  getLeaveDayValueFromType,
  isAnnualLeaveFamilyType,
  bareNameFuzzySameForLeaveStats,
  leavePersonKeyForLeaveStats,
  normalizeLeaveMatchKey,
} from '@/lib/leave-request-utils'

/** ลากิจ(태국 개인사유휴가): 연 3일 고정 */
const LAKIJ_DAYS_PER_YEAR = 3

/** 병가: 연 30일 고정 */
const SICK_DAYS_PER_YEAR = 30

/** 직원 1인당 휴가 신청 상한 (페이지 반복 조회 시) */
const LEAVE_ROWS_MAX_PER_EMPLOYEE = 15_000

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const userRole = String(auth.role || '').trim()
  const isScopedRole = !isOfficeRole(userRole) && !isAccountingRole(userRole)
  const queryStore = String(searchParams.get('store') || '').trim()
  const queryName = String(searchParams.get('name') || '').trim()
  const queryEmployeeIdRaw = String(searchParams.get('employeeId') || '').trim()
  const store = String(isScopedRole ? auth.store : queryStore || auth.store || '').trim()
  const name = String(isScopedRole ? auth.name : queryName || auth.name || '').trim()
  const employeeIdRaw = String(
    isScopedRole ? auth.employeeId || '' : queryEmployeeIdRaw || auth.employeeId || ''
  ).trim()
  const employeeIdNum =
    employeeIdRaw && Number.isFinite(Number(employeeIdRaw)) ? Math.floor(Number(employeeIdRaw)) : 0

  if (!store || !name) {
    return NextResponse.json(
      {
        history: [],
        stats: {
          usedAnn: 0,
          usedSick: 0,
          usedUnpaid: 0,
          usedLakij: 0,
          remain: 0,
          remainLakij: 0,
          remainSick: SICK_DAYS_PER_YEAR,
          annualTotal: 0,
          lakijTotal: LAKIJ_DAYS_PER_YEAR,
          sickTotal: SICK_DAYS_PER_YEAR,
        },
      },
      { headers }
    )
  }

  try {
    type EmpInfo = {
      id?: number
      store?: string
      name?: string
      name_title?: string | null
      annual_leave_days?: number | null
      join_date?: string | null
    }
    const empSelect = 'id,store,name,name_title,annual_leave_days,join_date,sal_type'
    let emp: EmpInfo | null = null
    if (employeeIdNum > 0) {
      const byId = (await supabaseSelectFilter(
        'employees',
        `id=eq.${employeeIdNum}&store=ilike.${encodeURIComponent(store)}`,
        { order: 'id.asc', limit: 1, select: empSelect }
      )) as EmpInfo[]
      const e0 = byId?.[0] ?? null
      if (!e0) {
        emp = null
      } else {
        const reqKey = leavePersonKeyForLeaveStats(name, '')
        const empKey = leavePersonKeyForLeaveStats(String(e0.name || ''), e0.name_title)
        if (reqKey !== empKey && !bareNameFuzzySameForLeaveStats(reqKey, empKey)) {
          emp = null
        } else {
          emp = e0
        }
      }
    } else {
      const empRows = (await supabaseSelectFilter(
        'employees',
        `store=ilike.${encodeURIComponent(store)}&name=ilike.${encodeURIComponent(name)}`,
        { order: 'id.asc', limit: 1, select: empSelect }
      )) as EmpInfo[]
      emp = empRows?.[0] ?? null
    }
    if (!emp) {
      return NextResponse.json(
        {
          history: [],
          stats: {
            usedAnn: 0,
            usedSick: 0,
            usedUnpaid: 0,
            usedLakij: 0,
            remain: 0,
            remainLakij: 0,
            remainSick: SICK_DAYS_PER_YEAR,
            annualTotal: 0,
            lakijTotal: LAKIJ_DAYS_PER_YEAR,
            sickTotal: SICK_DAYS_PER_YEAR,
          },
        },
        { headers }
      )
    }

    const annualTotal = getAnnualLeaveDays(emp)
    const empStoreQ = encodeURIComponent(String(emp.store || '').trim())
    const leaveFilter = `store=ilike.${empStoreQ}`
    const rawRows = (await supabaseSelectFilterAllPages('leave_requests', leaveFilter, {
      order: 'leave_date.desc',
      select: 'id,store,name,leave_date,status,type,reason,certificate_url,reject_reason,employee_id',
      pageSize: 800,
      maxRows: LEAVE_ROWS_MAX_PER_EMPLOYEE,
    })) as {
      id?: number
      store?: string
      name?: string
      leave_date?: string
      status?: string
      type?: string
      reason?: string
      certificate_url?: string
      reject_reason?: string
      employee_id?: number | null
    }[]
    const ek = leavePersonKeyForLeaveStats(String(emp.name || ''), emp.name_title)
    const empPk = emp.id != null ? Math.floor(Number(emp.id)) : 0
    const rows = (rawRows || []).filter((r) => {
      if (normalizeLeaveMatchKey(String(r.store || '')) !== normalizeLeaveMatchKey(String(emp.store || '')))
        return false
      const rid = r.employee_id != null ? Math.floor(Number(r.employee_id)) : 0
      if (empPk > 0 && rid > 0) return rid === empPk
      const lk = leavePersonKeyForLeaveStats(String(r.name || ''), '')
      return lk === ek || bareNameFuzzySameForLeaveStats(lk, ek)
    })

    const thisYear = parseInt(getBangkokTodayDateString().slice(0, 4), 10)
    let usedAnn = 0,
      usedSick = 0,
      usedUnpaid = 0,
      usedLakij = 0
    const history = (rows || []).map((r) => {
      const dateStr = toLeaveDateStrBangkok(r.leave_date)
      const status = String(r.status || '').trim()
      const type = String(r.type || '').trim()
      const isAnnualType = isAnnualLeaveFamilyType(type)
      const underOneYear = !!(dateStr && isAnnualType && !hasOneYearTenureAsOf(emp, dateStr))

      if (isApprovedLeaveStatus(status) && dateStr && parseInt(dateStr.slice(0, 4), 10) === thisYear) {
        const val = getLeaveDayValueFromType(type)
        if (type.indexOf('무급휴가') !== -1 || type.toLowerCase().indexOf('unpaid') !== -1 || underOneYear) {
          usedUnpaid += val
        } else if (type.indexOf('ลากิจ') !== -1 || type.toLowerCase().indexOf('lakij') !== -1) {
          usedLakij += val
        } else if (type.indexOf('병가') !== -1 || type.toLowerCase().indexOf('sick') !== -1) {
          usedSick += val
        } else {
          usedAnn += val
        }
      }
      const displayType = underOneYear && isAnnualType ? (getLeaveDayValueFromType(type) < 1 ? '무급휴가(반차)' : '무급휴가') : type
      return {
        id: r.id,
        date: dateStr,
        type: displayType,
        reason: r.reason || '',
        status,
        certificateUrl: r.certificate_url || '',
        rejectReason: (r.reject_reason ?? '').trim() || undefined,
      }
    })

    const remain = Math.max(0, annualTotal - usedAnn)
    const remainLakij = Math.max(0, LAKIJ_DAYS_PER_YEAR - usedLakij)
    const remainSick = Math.max(0, SICK_DAYS_PER_YEAR - usedSick)
    return NextResponse.json(
      {
        history,
        stats: {
          usedAnn,
          usedSick,
          usedUnpaid,
          usedLakij,
          remain,
          remainLakij,
          remainSick,
          annualTotal,
          lakijTotal: LAKIJ_DAYS_PER_YEAR,
          sickTotal: SICK_DAYS_PER_YEAR,
        },
      },
      { headers }
    )
  } catch (e) {
    console.error('getMyLeaveInfo:', e)
    return NextResponse.json(
      {
        history: [],
        stats: {
          usedAnn: 0,
          usedSick: 0,
          usedUnpaid: 0,
          usedLakij: 0,
          remain: 0,
          remainLakij: 0,
          remainSick: SICK_DAYS_PER_YEAR,
          annualTotal: 0,
          lakijTotal: LAKIJ_DAYS_PER_YEAR,
          sickTotal: SICK_DAYS_PER_YEAR,
        },
      },
      { headers }
    )
  }
}
