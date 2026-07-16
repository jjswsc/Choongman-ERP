import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import {
  ATTENDANCE_LOG_PAYROLL_COLS,
  ATTENDANCE_LOG_PAYROLL_COLS_NO_CODE,
} from '@/lib/postgrest-narrow-select'
import { bangkokDateRangeToUtc, toDateStrBangkok, getBangkokHour, addDayBangkok } from '@/lib/attendance-utils'
import {
  calcSSO,
  clockOutCountsForPayroll,
  grossWageBeforeSSO,
  isEmployeeSsoExemptFlag,
  otMinutesForPayroll,
  resolvePayrollWithholdingTax,
} from '@/lib/payroll-utils'
import { hazAllowEligibleWithEvalGrade } from '@/lib/payroll-haz-eval-grade'
import { loadPayrollHazEvalGradeRules } from '@/lib/payroll-haz-eval-grade-settings'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  isSaasTenantQueryBlocked,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

const LATE_DED_HOURS_BASE = 208
const OT_MULTIPLIER = 1.5

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function addDay(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** 공휴일 목록 (public_holidays 또는 기본값) */
async function getPublicHolidays(year: number): Promise<{ date: string; name: string }[]> {
  try {
    const rows = (await supabaseSelectFilter(
      'public_holidays',
      `year=eq.${year}`,
      { order: 'date.asc' }
    )) as { date?: string; name?: string }[]
    if (rows?.length) {
      return (rows || []).map((r) => ({
        date: toDateStr(r.date) || '',
        name: String(r.name || '').trim() || '-',
      })).filter((h) => h.date)
    }
  } catch {
    /* fallback below */
  }
  const fixed: { date: string; name: string }[] = [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: `${year}-04-06`, name: 'Chakri Day' },
    { date: `${year}-04-13`, name: 'Songkran' },
    { date: `${year}-05-01`, name: "Labour Day" },
    { date: `${year}-05-04`, name: 'Coronation Day' },
    { date: `${year}-08-12`, name: "Queen's Birthday" },
    { date: `${year}-10-13`, name: 'King Memorial Day' },
    { date: `${year}-12-05`, name: "King's Birthday" },
    { date: `${year}-12-10`, name: 'Constitution Day' },
  ]
  return fixed
}

type AttSummaryRow = { lateMin: number; earlyMin: number; otMin: number; workMin: number; workDays: number; workDates: string[] }

function payrollAttKey(store: string, name: string, employeeId?: number | null): string {
  const sid = employeeId != null && Number.isFinite(Number(employeeId)) ? Math.floor(Number(employeeId)) : 0
  if (sid > 0) return `${store}_#${sid}`
  return `${store}_${name}`
}

/** 귀속월 근태 집계: lateMin, otMin, workMin, workDays, workDates. 방콕 기준 + 자정 넘김은 출근일로 합침 */
async function getAttendanceSummary(monthStr: string): Promise<Record<string, AttSummaryRow>> {
  const startStr = monthStr + '-01'
  const firstDay = new Date(monthStr + '-01T12:00:00')
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0)
  const endStr = lastDay.toISOString().slice(0, 10)
  const { startISO } = bangkokDateRangeToUtc(startStr, endStr)
  const logEndISOExclusive = addDayBangkok(endStr, 1) + 'T00:00:00.000Z'

  const attRows = (await (async () => {
    try {
      return await supabaseSelectFilterAllPages(
        'attendance_logs',
        `log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(logEndISOExclusive)}`,
        {
          order: 'log_at.asc',
          select: ATTENDANCE_LOG_PAYROLL_COLS,
          pageSize: 2500,
          maxRows: 120000,
        }
      )
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (!/employee_id|employee_code|42703|column/i.test(em)) throw e
      return await supabaseSelectFilterAllPages(
        'attendance_logs',
        `log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(logEndISOExclusive)}`,
        {
          order: 'log_at.asc',
          select: ATTENDANCE_LOG_PAYROLL_COLS_NO_CODE,
          pageSize: 2500,
          maxRows: 120000,
        }
      )
    }
  })()) as {
    log_at?: string
    store_name?: string
    name?: string
    employee_id?: number | null
    log_type?: string
    late_min?: number
    early_min?: number
    ot_min?: number
    break_min?: number
    status?: string
    approved?: string
  }[]

  type DayRec = {
    inMs: number | null
    outMs: number | null
    breakMin: number
    otMin: number
    earlyMin: number
    outApproved: boolean
    lateMin: number
  }
  const byDay: Record<string, DayRec> = {}
  const map: Record<string, AttSummaryRow> = {}

  for (const r of attRows || []) {
    const rowDate = toDateStrBangkok(r.log_at)
    const type = String(r.log_type || '').trim()
    const logAt = r.log_at || ''
    if (!rowDate || rowDate < startStr) continue
    if (rowDate > endStr) {
      const allowOvernightOut = type === '퇴근' && getBangkokHour(logAt) <= 7 && rowDate === addDayBangkok(endStr, 1)
      if (!allowOvernightOut) continue
    }
    const store = String(r.store_name || '').trim()
    const name = String(r.name || '').trim()
    if (!store || !name) continue
    const key = payrollAttKey(store, name, r.employee_id)
    const dayKey = rowDate + '_' + key
    if (!map[key]) map[key] = { lateMin: 0, earlyMin: 0, otMin: 0, workMin: 0, workDays: 0, workDates: [] }
    if (!byDay[dayKey]) {
      byDay[dayKey] = { inMs: null, outMs: null, breakMin: 0, otMin: 0, earlyMin: 0, outApproved: false, lateMin: 0 }
    }

    const approval = String(r.approved || '').trim()
    const status = String(r.status || '').trim()
    const isApproved = approval === '승인' || approval === '승인완료'
    const needsApproval = status.includes('위치미확인') || status.includes('승인대기')
    const dt = new Date(r.log_at || '').getTime()

    if (type === '출근') {
      const lateWaived = status === '정상(승인)'
      const lateMinRow = Number(r.late_min) || 0
      if (!byDay[dayKey].inMs || dt < (byDay[dayKey].inMs || 0)) {
        byDay[dayKey].inMs = dt
        if ((!needsApproval || isApproved) && !lateWaived) {
          byDay[dayKey].lateMin = lateMinRow
        } else {
          byDay[dayKey].lateMin = 0
        }
      }
    } else if (type === '퇴근') {
      if (!byDay[dayKey].outMs || dt > (byDay[dayKey].outMs || 0)) {
        byDay[dayKey].outMs = dt
        byDay[dayKey].outApproved = clockOutCountsForPayroll(r.approved, r.status)
        byDay[dayKey].otMin = Number(r.ot_min) || 0
        byDay[dayKey].earlyMin = Number((r as { early_min?: number }).early_min) || 0
      }
    } else if (type === '휴식종료') {
      byDay[dayKey].breakMin += Number((r as { break_min?: number }).break_min) || 0
    }
  }

  // 자정 넘김: 익일 퇴근만 있는 날 → 전날(출근일)에 합침
  for (const dk of Object.keys(byDay)) {
    const v = byDay[dk]
    if (v.outMs != null && v.inMs == null) {
      const rowDate = dk.slice(0, 10)
      const attKey = dk.slice(11)
      const prevKey = addDay(rowDate, -1) + '_' + attKey
      const prev = byDay[prevKey]
      if (prev && prev.inMs != null && prev.outMs == null) {
        prev.outMs = v.outMs
        prev.breakMin += v.breakMin
        prev.outApproved = v.outApproved
        prev.otMin = v.otMin
        prev.earlyMin = v.earlyMin || 0
        v.outMs = null
      }
    }
  }

  for (const dk of Object.keys(byDay)) {
    const v = byDay[dk]
    const attKey = dk.slice(11)
    const rowDate = dk.slice(0, 10)
    if (rowDate >= startStr && rowDate <= endStr) {
      if (!map[attKey]) map[attKey] = { lateMin: 0, earlyMin: 0, otMin: 0, workMin: 0, workDays: 0, workDates: [] }
      map[attKey].lateMin += v.lateMin || 0
    }
    if (v.inMs != null && v.outMs != null && v.outApproved && v.outMs > v.inMs) {
      if (!map[attKey]) map[attKey] = { lateMin: 0, earlyMin: 0, otMin: 0, workMin: 0, workDays: 0, workDates: [] }
      const minWork = Math.max(0, Math.floor((v.outMs - v.inMs) / 60000) - (v.breakMin || 0))
      map[attKey].workMin += minWork
      map[attKey].otMin += otMinutesForPayroll(v.otMin)
      map[attKey].earlyMin += v.earlyMin || 0
      map[attKey].workDays += 1
      if (rowDate && !map[attKey].workDates.includes(rowDate)) map[attKey].workDates.push(rowDate)
    }
  }
  return map
}

/** 공휴일 근무 일수 (attSummary의 workDates 사용) */
function getHolidayWorkDays(
  attKey: string,
  workDates: string[],
  holidaySet: Record<string, boolean>
): number {
  let count = 0
  for (const d of workDates) {
    if (holidaySet[d]) count++
  }
  return count
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'employees')) {
    return NextResponse.json({ success: true, list: [] }, { headers })
  }
  const monthStr = String(searchParams.get('monthStr') || searchParams.get('month') || '').trim().slice(0, 7)
  let storeFilter = String(searchParams.get('store') || '').trim()
  if (storeFilter === 'All' || storeFilter === '전체') storeFilter = ''

  if (!monthStr || monthStr.length < 7) {
    return NextResponse.json({ success: false, list: [], message: '월(yyyy-MM)을 선택해주세요.' }, { headers })
  }

  try {
    type EmpRow = {
      id?: number
      employee_code?: string | null
      store?: string
      name?: string
      job?: string
      grade?: string
      sal_type?: string
      sal_amt?: number
      position_allowance?: number
      haz_allow?: number
      birth?: string
      join_date?: string
      role?: string
      sso_exempt?: boolean | null
    }
    const empSel =
      'id,employee_code,store,name,job,grade,sal_type,sal_amt,position_allowance,haz_allow,birth,join_date,role,sso_exempt'
    const empSelFallback = empSel.replace(',sso_exempt', '')
    const empSelNoGrade = empSel.replace(',grade,', ',')
    const empSelNoGradeFb = empSelFallback.replace(',grade,', ',')
    const empSelNoCode = empSel.replace('employee_code,', '')
    const empSelNoCodeFallback = empSelFallback.replace('employee_code,', '')
    const empSelNoCodeNoGrade = empSelNoGrade.replace('employee_code,', '')
    const empSelNoCodeNoGradeFb = empSelNoGradeFb.replace('employee_code,', '')
    const empSelectCandidates = [
      empSel,
      empSelFallback,
      empSelNoGrade,
      empSelNoGradeFb,
      empSelNoCode,
      empSelNoCodeFallback,
      empSelNoCodeNoGrade,
      empSelNoCodeNoGradeFb,
    ]
    let empRows: EmpRow[] = []
    let empLoadErr: unknown = null
    for (const sel of empSelectCandidates) {
      try {
        if (storeFilter) {
          empRows = (await supabaseSelectFilter(
            'employees',
            appendSaasTenantFilter(`store=ilike.${encodeURIComponent(storeFilter)}`, tenantScope, 'employees'),
            { order: 'id.asc', select: sel }
          )) as EmpRow[]
        } else {
          empRows = (await supabaseSelectFilter('employees', appendSaasTenantFilter('id=gt.0', tenantScope, 'employees'), { order: 'id.asc', select: sel })) as EmpRow[]
        }
        empLoadErr = null
        break
      } catch (e) {
        empLoadErr = e
      }
    }
    if (empLoadErr) throw empLoadErr

    const hazEvalRules = await loadPayrollHazEvalGradeRules()

    const attSummary = await getAttendanceSummary(monthStr)
    const targetDate = new Date(monthStr + '-01')
    const targetMonth = targetDate.getMonth()
    const payrollYear = targetDate.getFullYear()
    const holidays = await getPublicHolidays(payrollYear)
    const startStr = monthStr + '-01'
    const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0)
    const endStr = lastDay.toISOString().slice(0, 10)
    const holidaySet: Record<string, boolean> = {}
    for (const h of holidays) {
      if (h.date >= startStr && h.date <= endStr) holidaySet[h.date] = true
    }

    const list: {
      store: string
      name: string
      employeeId?: number
      employeeCode?: string
      salary: number
      posAllow: number
      hazAllow: number
      birthBonus: number
      holidayPay: number
      otAmt: number
      lateMin: number
      lateDed: number
      earlyMin: number
      earlyDed: number
      sso: number
      tax: number
      netPay: number
    }[] = []

    for (const e of empRows || []) {
      const store = String(e.store || '').trim()
      const name = String(e.name || '').trim()
      if (!name) continue
      const employeeId = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
      const employeeCode = String(e.employee_code || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5)

      const salType = String(e.sal_type || '').trim().toLowerCase()
      const isHourly = ['시급', 'hourly', 'hour', 'part-time', 'part time'].includes(salType)
      const salAmt = Number(e.sal_amt) || 0
      const posAllow = Number(e.position_allowance) || 0
      const hazAllowDaily = Number(e.haz_allow) || 0
      const job = String(e.job || '').trim()
      const isKitchen = /주방|kitchen|chef|쿡|cook/i.test(job)
      const empGrade = String(e.grade || '').trim()

      const attKey = payrollAttKey(store, name, e.id)
      const att = attSummary[attKey] || { lateMin: 0, earlyMin: 0, otMin: 0, workMin: 0, workDays: 0, workDates: [] }
      const lateMin = att.lateMin
      const earlyMin = att.earlyMin
      const otMin = att.otMin
      const workMin = att.workMin
      const workDays = att.workDays

      let salary = 0
      let lateDed = 0
      let earlyDed = 0
      let otAmt = 0
      if (isHourly) {
        salary = salAmt > 0 && workMin > 0 ? Math.floor((workMin / 60) * salAmt) : 0
        lateDed = salAmt > 0 && lateMin > 0 ? Math.floor((lateMin / 60) * salAmt) : 0
        earlyDed = salAmt > 0 && earlyMin > 0 ? Math.floor((earlyMin / 60) * salAmt) : 0
        otAmt = salAmt > 0 && otMin > 0 ? Math.floor((otMin / 60) * salAmt * OT_MULTIPLIER) : 0
      } else {
        salary = salAmt
        lateDed = LATE_DED_HOURS_BASE > 0 && salary > 0 && lateMin > 0
          ? Math.floor((lateMin / 60) * (salary / LATE_DED_HOURS_BASE))
          : 0
        earlyDed = LATE_DED_HOURS_BASE > 0 && salary > 0 && earlyMin > 0
          ? Math.floor((earlyMin / 60) * (salary / LATE_DED_HOURS_BASE))
          : 0
        const hourlyForOt = LATE_DED_HOURS_BASE > 0 && salary ? salary / LATE_DED_HOURS_BASE : 0
        otAmt = hourlyForOt > 0 && otMin > 0 ? Math.floor((otMin / 60) * hourlyForOt * OT_MULTIPLIER) : 0
      }

      let hazAllow = 0
      if (hazAllowEligibleWithEvalGrade(isKitchen, hazAllowDaily, workDays, empGrade, hazEvalRules)) {
        hazAllow = Math.floor(hazAllowDaily * workDays)
      }

      let birthBonus = 0
      if (e.birth) {
        const joinStr = toDateStr(e.join_date)
        const joinDate = joinStr ? new Date(joinStr + 'T12:00:00') : new Date()
        const workYears = (targetDate.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
        const birth = new Date(e.birth)
        if (birth.getMonth() === targetMonth && workYears >= 1) birthBonus = 500
      }

      let holidayPay = 0
      const holidayWorkDays = getHolidayWorkDays(attKey, att.workDates || [], holidaySet)
      if (holidayWorkDays > 0) {
        if (isHourly && salAmt > 0) holidayPay = Math.floor(holidayWorkDays * 8 * salAmt)
        else if (salary > 0) holidayPay = Math.floor((salary / 30) * holidayWorkDays)
      }

      const income = salary + posAllow + hazAllow + birthBonus + holidayPay + otAmt
      const ssoExempt = isEmployeeSsoExemptFlag(e.sso_exempt)
      const ssoGrossWage = grossWageBeforeSSO({
        salary,
        posAllow,
        hazAllow,
        birthBonus,
        holidayPay,
        otAmt,
        lateDed,
        earlyDed,
      })
      const sso = ssoExempt ? 0 : calcSSO(ssoGrossWage, payrollYear)
      const tax = resolvePayrollWithholdingTax({
        ssoExempt,
        monthlyGrossBeforeSso: ssoGrossWage,
        monthlySso: sso,
      }).tax
      const deduct = lateDed + earlyDed + sso + tax
      const netPay = Math.max(0, income - deduct)

      list.push({
        store,
        name,
        ...(employeeId > 0 ? { employeeId } : {}),
        ...(employeeCode ? { employeeCode } : {}),
        salary,
        posAllow,
        hazAllow,
        birthBonus,
        holidayPay,
        otAmt,
        lateMin,
        lateDed,
        earlyMin,
        earlyDed,
        sso,
        tax,
        netPay,
      })
    }

    list.sort((a, b) => {
      if (a.store !== b.store) return a.store.localeCompare(b.store)
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    console.error('calculatePayroll:', e)
    return NextResponse.json(
      { success: false, list: [], message: (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
