import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import {
  ATTENDANCE_LOG_PAYROLL_COLS,
  ATTENDANCE_LOG_PAYROLL_COLS_NO_CODE,
} from '@/lib/postgrest-narrow-select'
import { bangkokDateRangeToUtc, toDateStrBangkok, getBangkokHour, addDayBangkok } from '@/lib/attendance-utils'
import {
  calcSSO,
  clockOutCountsForPayroll,
  isEmployeeSsoExemptFlag,
  otMinutesForPayroll,
  ssoContributionBaseWage,
} from '@/lib/payroll-utils'
import { hazAllowEligibleWithEvalGrade } from '@/lib/payroll-haz-eval-grade'
import { loadPayrollHazEvalGradeRules } from '@/lib/payroll-haz-eval-grade-settings'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

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

function payrollAttKey(store: string, name: string, employeeId?: number | null): string {
  const sid = employeeId != null && Number.isFinite(Number(employeeId)) ? Math.floor(Number(employeeId)) : 0
  if (sid > 0) return `${store}_#${sid}`
  return `${store}_${name}`
}

/** 근태 집계: 지각분, 연장분, 근무분, 출근일수 (store|name 기준). 방콕 기준 + 자정 넘김은 출근일로 합침 */
async function getAttendanceSummary(monthStr: string, storeFilter?: string): Promise<Record<string, { lateMin: number; earlyMin: number; otMin: number; workMin: number; workDays: number }>> {
  const startStr = monthStr + '-01'
  const lastDay = new Date(parseInt(monthStr.slice(0, 4), 10), parseInt(monthStr.slice(5, 7), 10), 0)
  const endStr = lastDay.toISOString().slice(0, 10)
  const { startISO } = bangkokDateRangeToUtc(startStr, endStr)
  const logEndISOExclusive = addDayBangkok(endStr, 1) + 'T00:00:00.000Z'

  type AttRow = {
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
  }
  let attRows: AttRow[] = []
  const attPages = {
    order: 'log_at.asc' as const,
    select: ATTENDANCE_LOG_PAYROLL_COLS,
    pageSize: 2500,
    maxRows: 120000,
  }
  if (storeFilter) {
    try {
      attRows = (await supabaseSelectFilterAllPages(
        'attendance_logs',
        `store_name=ilike.${encodeURIComponent(storeFilter)}&log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(logEndISOExclusive)}`,
        { ...attPages, select: ATTENDANCE_LOG_PAYROLL_COLS }
      )) as AttRow[]
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (!/employee_id|employee_code|42703|column/i.test(em)) throw e
      attRows = (await supabaseSelectFilterAllPages(
        'attendance_logs',
        `store_name=ilike.${encodeURIComponent(storeFilter)}&log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(logEndISOExclusive)}`,
        { ...attPages, select: ATTENDANCE_LOG_PAYROLL_COLS_NO_CODE }
      )) as AttRow[]
    }
  } else {
    try {
      attRows = (await supabaseSelectFilterAllPages(
        'attendance_logs',
        `log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(logEndISOExclusive)}`,
        { ...attPages, select: ATTENDANCE_LOG_PAYROLL_COLS }
      )) as AttRow[]
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (!/employee_id|employee_code|42703|column/i.test(em)) throw e
      attRows = (await supabaseSelectFilterAllPages(
        'attendance_logs',
        `log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(logEndISOExclusive)}`,
        { ...attPages, select: ATTENDANCE_LOG_PAYROLL_COLS_NO_CODE }
      )) as AttRow[]
    }
  }

  const byDay: Record<string, { inMs: number | null; outMs: number | null; breakMin: number; outApproved: boolean; lateMin: number; earlyMin: number; otMin: number; breakSeen: Set<string> }> = {}
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
    const dayKey = `${rowDate}|${payrollAttKey(store, name, r.employee_id)}`
    if (!byDay[dayKey]) {
      byDay[dayKey] = { inMs: null, outMs: null, breakMin: 0, outApproved: false, lateMin: 0, earlyMin: 0, otMin: 0, breakSeen: new Set<string>() }
    }
    const v = byDay[dayKey]
    const approved = String(r.approved || '').trim()
    const status = String(r.status || '').trim()
    const isApproved = approved === '승인' || approved === '승인완료'
    const needsApproval = /위치미확인|승인대기/.test(status)
    const dt = r.log_at ? new Date(r.log_at).getTime() : 0

    if (type === '출근') {
      if (!v.inMs || dt < v.inMs) {
        v.inMs = dt
        const lateWaived = status === '정상(승인)'
        if ((!needsApproval || isApproved) && !lateWaived) v.lateMin = Number(r.late_min) || 0
      }
    } else if (type === '퇴근') {
      if (!v.outMs || dt > v.outMs) {
        v.outMs = dt
        v.outApproved = clockOutCountsForPayroll(r.approved, r.status)
        v.otMin = Number(r.ot_min) || 0
        v.earlyMin = Number(r.early_min) || 0
      }
    } else if (type === '휴식종료') {
      const breakLogKey = `${String(logAt).slice(0, 19)}|${Number(r.break_min) || 0}`
      if (!v.breakSeen.has(breakLogKey)) {
        v.breakSeen.add(breakLogKey)
        v.breakMin += Number(r.break_min) || 0
      }
    }
  }

  // 자정 넘김: 익일 퇴근만 있는 날 → 전날(출근일)에 합침
  for (const [dayKey, v] of Object.entries(byDay)) {
    if (v.outMs != null && v.inMs == null) {
      const parts = dayKey.split('|')
      const rowDate = parts[0]
      const attKey = parts.slice(1).join('|')
      const prevKey = `${addDay(rowDate, -1)}|${attKey}`
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

  const map: Record<string, { lateMin: number; earlyMin: number; otMin: number; workMin: number; workDays: number }> = {}
  for (const [dayKey, v] of Object.entries(byDay)) {
    if (v.inMs == null || v.outMs == null || !v.outApproved || v.outMs <= v.inMs) continue
    const parts = dayKey.split('|')
    const key = parts.slice(1).join('|')
    if (!map[key]) map[key] = { lateMin: 0, earlyMin: 0, otMin: 0, workMin: 0, workDays: 0 }
    map[key].workMin += Math.max(0, Math.floor((v.outMs - v.inMs) / 60000) - v.breakMin)
    map[key].lateMin += v.lateMin
    map[key].earlyMin += v.earlyMin || 0
    map[key].otMin += otMinutesForPayroll(v.otMin)
    map[key].workDays += 1
  }
  return map
}

/** 공휴일 해당 월에 근무한 일수 (store|name -> 일수) */
async function getHolidayWorkDaysMap(
  monthStr: string,
  storeFilter?: string
): Promise<Record<string, number>> {
  const year = parseInt(monthStr.slice(0, 4), 10)
  const startStr = monthStr + '-01'
  const mo = parseInt(monthStr.slice(5, 7), 10)
  const lastDay = new Date(year, mo, 0)
  const endStr = lastDay.toISOString().slice(0, 10)

  const holidayRows = (await supabaseSelectFilter('public_holidays', `year=eq.${year}`, { order: 'date.asc' })) as { date?: string }[]
  const holidaySet: Record<string, boolean> = {}
  for (const h of holidayRows || []) {
    const d = toDateStr(h.date)
    if (d && d >= startStr && d <= endStr) holidaySet[d] = true
  }

  const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
  const holidayAttSelect = 'log_at,store_name,name,log_type,status,approved'
  type AttRow = { log_at?: string; store_name?: string; name?: string; employee_id?: number | null; log_type?: string; status?: string; approved?: string }
  let attRows: AttRow[] = []
  const holPages = {
    order: 'log_at.asc' as const,
    select: holidayAttSelect,
    pageSize: 2500,
    maxRows: 120000,
  }
  if (storeFilter) {
    attRows = (await supabaseSelectFilterAllPages(
      'attendance_logs',
      `store_name=ilike.${encodeURIComponent(storeFilter)}&log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(endISOExclusive)}`,
      holPages
    )) as AttRow[]
  } else {
    attRows = (await supabaseSelectFilterAllPages(
      'attendance_logs',
      `log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(endISOExclusive)}`,
      holPages
    )) as AttRow[]
  }

  const byDay: Record<string, boolean> = {}
  for (const r of attRows || []) {
    if (String(r.name || '').trim() === '') continue
    const type = String(r.log_type || '').trim()
    if (type !== '출근' && type !== '퇴근') continue
    const st = String(r.status || '').trim()
    const app = String(r.approved || '').trim()
    const needApp = /위치미확인|승인대기/.test(st)
    if (needApp && app !== '승인' && app !== '승인완료') continue
    const d = toDateStrBangkok(r.log_at)
    const store = String(r.store_name || '').trim()
    const name = String(r.name || '').trim()
    if (d && d >= startStr && d <= endStr && store && name) {
      byDay[`${d}|${payrollAttKey(store, name, r.employee_id)}`] = true
    }
  }

  const map: Record<string, number> = {}
  for (const dayKey of Object.keys(byDay)) {
    if (!holidaySet[dayKey.split('|')[0]]) continue
    const parts = dayKey.split('|')
    const key = parts.slice(1).join('|')
    map[key] = (map[key] || 0) + 1
  }
  return map
}

export interface PayrollPreviewRow {
  store: string
  name: string
  employeeId?: number
  employeeCode?: string
  dept: string
  role: string
  salary: number
  posAllow: number
  hazAllow: number
  birthBonus: number
  holidayPay: number
  splBonus: number
  ot15: number
  otAmt: number
  lateMin: number
  lateDed: number
  earlyMin: number
  earlyDed: number
  sso: number
  otherDed: number
  netPay: number
}

/** 급여 계산 미리보기 */
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
  const monthStr = String(searchParams.get('month') || searchParams.get('monthStr') || '').trim()
  let storeFilter = String(searchParams.get('store') || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(auth.store || '').trim())

  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
    return NextResponse.json({ success: false, list: [], msg: 'Invalid month (use yyyy-MM)' }, { headers })
  }

  if (storeFilter === 'All' || storeFilter === '전체') storeFilter = ''

  const isOfficeLevel = isOfficeRole(userRole) || isAccountingRole(userRole)
  if (!isOfficeLevel) {
    if (!storeFilter) {
      storeFilter = String(allowedStores[0] || '').trim()
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeFilter))
      if (!allowed) {
        return NextResponse.json({ success: false, list: [], msg: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
  }

  const isDirector = userRole.includes('director') || userRole.includes('ceo') || userRole.includes('hr')
  const isOffice = storeFilter === 'Office' || storeFilter === '오피스' || storeFilter === '본사' || storeFilter.toLowerCase() === 'office'
  if (isOffice && !isDirector) {
    return NextResponse.json({ success: true, list: [] }, { headers })
  }

  try {
    function isOfficeStore(s: string) {
      const x = String(s || '').trim()
      return x === '본사' || x === 'Office' || x === '오피스' || x.toLowerCase() === 'office'
    }

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
          empRows = (await supabaseSelectFilter('employees', `store=ilike.${encodeURIComponent(storeFilter)}`, {
            order: 'id.asc',
            select: sel,
          })) as EmpRow[]
        } else {
          empRows = (await supabaseSelect('employees', { order: 'id.asc', select: sel })) as EmpRow[]
        }
        empLoadErr = null
        break
      } catch (e) {
        empLoadErr = e
      }
    }
    if (empLoadErr) throw empLoadErr

    if (!isDirector) {
      empRows = empRows.filter((e) => !isOfficeStore(String(e.store || '')))
    }

    const hazEvalRules = await loadPayrollHazEvalGradeRules()

    const attSummary = await getAttendanceSummary(monthStr, storeFilter || undefined)
    const holidayWorkMap = await getHolidayWorkDaysMap(monthStr, storeFilter || undefined)
    const targetDate = new Date(monthStr + '-01')
    const targetMonth = targetDate.getMonth()
    const list: PayrollPreviewRow[] = []

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

      const dept = String(e.job || '').trim()
      const role = String(e.role || '').trim()
      const salType = String(e.sal_type || '').trim().toLowerCase()
      const isHourly = ['시급', 'hourly', 'hour', 'part-time', 'part time'].some((x) => salType.includes(x))
      const salAmt = Number(e.sal_amt) || 0
      const posAllow = Number(e.position_allowance) || 0
      const hazAllowPerDay = Number(e.haz_allow) || 0
      const joinDate = e.join_date ? new Date(e.join_date) : new Date()

      /** Director는 출퇴근 개념 없이 고정 급여. 기록된 sal_amt 그대로 사용, 가감 없음 */
      const isDirectorRole = String(e.role || '').trim().toLowerCase().includes('director')

      let salary = salAmt
      let birthBonus = 0
      if (e.birth) {
        const birth = new Date(e.birth)
        const workYears = (targetDate.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
        if (birth.getMonth() === targetMonth && workYears >= 1) birthBonus = 500
      }

      const attKey = payrollAttKey(store, name, e.id)
      const att = attSummary[attKey] || { lateMin: 0, earlyMin: 0, otMin: 0, workMin: 0, workDays: 0 }
      const lateMin = att.lateMin
      const earlyMin = att.earlyMin
      const otMin = att.otMin
      const workMin = att.workMin
      const workDays = att.workDays

      const isKitchen = /주방|kitchen|chef|쿡|cook/i.test(dept)
      const empGrade = String(e.grade || '').trim()
      let hazAllow = 0
      if (hazAllowEligibleWithEvalGrade(isKitchen, hazAllowPerDay, workDays, empGrade, hazEvalRules)) {
        hazAllow = Math.floor(workDays * hazAllowPerDay)
      }

      let lateDed = 0
      let earlyDed = 0
      let otAmt = 0
      let sso = 0
      let holidayPay = 0
      let ot15 = 0

      if (isDirectorRole) {
        salary = salAmt
        lateDed = 0
        earlyDed = 0
        otAmt = 0
        sso = 0
        holidayPay = 0
        hazAllow = 0
        birthBonus = 0
        ot15 = 0
      } else {
        ot15 = Math.round((otMin / 60) * 10) / 10
        if (isHourly) {
          salary = salAmt > 0 && workMin > 0 ? Math.floor((workMin / 60) * salAmt) : 0
          lateDed = salAmt > 0 && lateMin > 0 ? Math.floor((lateMin / 60) * salAmt) : 0
          earlyDed = salAmt > 0 && earlyMin > 0 ? Math.floor((earlyMin / 60) * salAmt) : 0
          otAmt = salAmt > 0 && otMin > 0 ? Math.floor((otMin / 60) * salAmt * OT_MULTIPLIER) : 0
        } else {
          const hoursBase = LATE_DED_HOURS_BASE
          lateDed = hoursBase > 0 && salary > 0 ? Math.floor((lateMin / 60) * (salary / hoursBase)) : 0
          earlyDed = hoursBase > 0 && salary > 0 && earlyMin > 0 ? Math.floor((earlyMin / 60) * (salary / hoursBase)) : 0
          const hourlyRateForOt = hoursBase > 0 && salary > 0 ? salary / hoursBase : 0
          otAmt = hourlyRateForOt > 0 ? Math.floor((otMin / 60) * hourlyRateForOt * OT_MULTIPLIER) : 0
        }
        const holidayWorkDays = holidayWorkMap[attKey] || 0
        if (holidayWorkDays > 0) {
          if (isHourly && salAmt > 0) holidayPay = Math.floor(holidayWorkDays * 8 * salAmt)
          else if (salary > 0) holidayPay = Math.floor((salary / 30) * holidayWorkDays)
        }
        const previewYear = targetDate.getFullYear()
        const ssoExempt = isEmployeeSsoExemptFlag(e.sso_exempt)
        const ssoBase = ssoContributionBaseWage(isHourly, salAmt, salary)
        sso = ssoExempt ? 0 : calcSSO(ssoBase, previewYear)
      }

      const effectivePosAllow = isDirectorRole ? 0 : posAllow
      const income = salary + effectivePosAllow + hazAllow + birthBonus + holidayPay + otAmt
      const deduct = lateDed + earlyDed + sso
      const netPay = income - deduct

      list.push({
        store,
        name,
        ...(employeeId > 0 ? { employeeId } : {}),
        ...(employeeCode ? { employeeCode } : {}),
        dept,
        role,
        salary,
        posAllow: effectivePosAllow,
        hazAllow,
        birthBonus,
        holidayPay,
        splBonus: 0,
        ot15,
        otAmt,
        lateMin,
        lateDed,
        earlyMin,
        earlyDed,
        sso,
        otherDed: 0,
        netPay,
      })
    }

    list.sort((a, b) => {
      if (a.store !== b.store) return a.store.localeCompare(b.store)
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    console.error('getPayrollPreview:', e)
    return NextResponse.json({ success: false, list: [], msg: String(e) }, { headers })
  }
}
