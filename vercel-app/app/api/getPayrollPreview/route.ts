import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

const LATE_DED_HOURS_BASE = 208
const OT_MULTIPLIER = 1.5

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function getSSOLimitsByYear(year: number): { ceiling: number; maxDed: number } {
  if (year <= 2025) return { ceiling: 15000, maxDed: 750 }
  if (year <= 2028) return { ceiling: 17500, maxDed: 875 }
  if (year <= 2031) return { ceiling: 20000, maxDed: 1000 }
  return { ceiling: 23000, maxDed: 1150 }
}

/** 근태 집계: 지각분, 연장분, 근무분, 출근일수 (store|name 기준) */
async function getAttendanceSummary(monthStr: string, storeFilter?: string): Promise<Record<string, { lateMin: number; otMin: number; workMin: number; workDays: number }>> {
  const startStr = monthStr + '-01'
  const lastDay = new Date(parseInt(monthStr.slice(0, 4), 10), parseInt(monthStr.slice(5, 7), 10), 0)
  const endStr = lastDay.toISOString().slice(0, 10)
  const endStrNext = new Date(lastDay.getTime() + 86400000).toISOString().slice(0, 10)

  type AttRow = { log_at?: string; store_name?: string; name?: string; log_type?: string; late_min?: number; ot_min?: number; break_min?: number; status?: string; approved?: string }
  let attRows: AttRow[] = []
  if (storeFilter) {
    attRows = (await supabaseSelectFilter(
      'attendance_logs',
      `store_name=ilike.${encodeURIComponent(storeFilter)}&log_at=gte.${startStr}&log_at=lt.${endStrNext}`,
      { order: 'log_at.asc', limit: 3000 }
    )) as AttRow[]
  } else {
    attRows = (await supabaseSelectFilter(
      'attendance_logs',
      `log_at=gte.${startStr}&log_at=lt.${endStrNext}`,
      { order: 'log_at.asc', limit: 3000 }
    )) as AttRow[]
  }

  const byDay: Record<string, { inMs: number | null; outMs: number | null; breakMin: number; outApproved: boolean; lateMin: number; otMin: number }> = {}
  for (const r of attRows || []) {
    const rowDate = toDateStr(r.log_at)
    if (!rowDate || rowDate < startStr || rowDate > endStr) continue
    const store = String(r.store_name || '').trim()
    const name = String(r.name || '').trim()
    if (!store || !name) continue
    const dayKey = `${rowDate}|${store}|${name}`
    if (!byDay[dayKey]) {
      byDay[dayKey] = { inMs: null, outMs: null, breakMin: 0, outApproved: false, lateMin: 0, otMin: 0 }
    }
    const v = byDay[dayKey]
    const type = String(r.log_type || '').trim()
    const approved = String(r.approved || '').trim()
    const status = String(r.status || '').trim()
    const isApproved = approved === '승인' || approved === '승인완료'
    const needsApproval = /위치미확인|승인대기/.test(status)
    const dt = r.log_at ? new Date(r.log_at).getTime() : 0

    if (type === '출근') {
      if (!v.inMs || dt < v.inMs) {
        v.inMs = dt
        if (!needsApproval || isApproved) v.lateMin = Number(r.late_min) || 0
      }
    } else if (type === '퇴근') {
      if (!v.outMs || dt > v.outMs) {
        v.outMs = dt
        v.breakMin = Number(r.break_min) || 0
        v.outApproved = isApproved
        v.otMin = Number(r.ot_min) || 0
      }
    } else if (type === '휴식종료') {
      v.breakMin += Number(r.break_min) || 0
    }
  }

  const map: Record<string, { lateMin: number; otMin: number; workMin: number; workDays: number }> = {}
  for (const [dayKey, v] of Object.entries(byDay)) {
    if (v.inMs == null || v.outMs == null || !v.outApproved || v.outMs <= v.inMs) continue
    const parts = dayKey.split('|')
    const store = parts[1] || ''
    const name = parts[2] || ''
    const key = `${store}_${name}`
    if (!map[key]) map[key] = { lateMin: 0, otMin: 0, workMin: 0, workDays: 0 }
    map[key].workMin += Math.max(0, Math.floor((v.outMs - v.inMs) / 60000) - v.breakMin)
    map[key].lateMin += v.lateMin
    map[key].otMin += v.otMin
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
  const lastDay = new Date(year, parseInt(monthStr.slice(5, 7), 10) - 1, 0)
  const endStr = lastDay.toISOString().slice(0, 10)

  const holidayRows = (await supabaseSelectFilter('public_holidays', `year=eq.${year}`, { order: 'date.asc' })) as { date?: string }[]
  const holidaySet: Record<string, boolean> = {}
  for (const h of holidayRows || []) {
    const d = toDateStr(h.date)
    if (d && d >= startStr && d <= endStr) holidaySet[d] = true
  }

  type AttRow = { log_at?: string; store_name?: string; name?: string; log_type?: string; status?: string; approved?: string }
  let attRows: AttRow[] = []
  if (storeFilter) {
    attRows = (await supabaseSelectFilter(
      'attendance_logs',
      `store_name=ilike.${encodeURIComponent(storeFilter)}&log_at=gte.${startStr}&log_at=lte.${endStr}T23:59:59`,
      { order: 'log_at.asc', limit: 2000 }
    )) as AttRow[]
  } else {
    attRows = (await supabaseSelectFilter(
      'attendance_logs',
      `log_at=gte.${startStr}&log_at=lte.${endStr}T23:59:59`,
      { order: 'log_at.asc', limit: 3000 }
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
    const d = toDateStr(r.log_at)
    const store = String(r.store_name || '').trim()
    const name = String(r.name || '').trim()
    if (d && d >= startStr && d <= endStr && store && name) byDay[`${d}|${store}|${name}`] = true
  }

  const map: Record<string, number> = {}
  for (const dayKey of Object.keys(byDay)) {
    if (!holidaySet[dayKey.split('|')[0]]) continue
    const parts = dayKey.split('|')
    const store = parts[1] || ''
    const name = parts[2] || ''
    const key = `${store}_${name}`
    map[key] = (map[key] || 0) + 1
  }
  return map
}

export interface PayrollPreviewRow {
  store: string
  name: string
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
  sso: number
  otherDed: number
  netPay: number
}

/** 급여 계산 미리보기 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const monthStr = String(searchParams.get('month') || searchParams.get('monthStr') || '').trim()
  let storeFilter = String(searchParams.get('store') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
    return NextResponse.json({ success: false, list: [], msg: 'Invalid month (use yyyy-MM)' }, { headers })
  }

  if (storeFilter === 'All' || storeFilter === '전체') storeFilter = ''

  const isDirector = userRole.includes('director') || userRole.includes('ceo') || userRole.includes('hr')
  const isOffice = storeFilter === 'Office' || storeFilter === '오피스' || storeFilter === '본사' || storeFilter.toLowerCase() === 'office'
  if (isOffice && !isDirector) {
    return NextResponse.json({ success: true, list: [] }, { headers })
  }

  try {
    const OFFICE_STORES = ['본사', 'Office', '오피스', '본점']
    function isOfficeStore(s: string) {
      const x = String(s || '').trim()
      return x === '본사' || x === 'Office' || x === '오피스' || x.toLowerCase() === 'office'
    }

    type EmpRow = { store?: string; name?: string; job?: string; sal_type?: string; sal_amt?: number; position_allowance?: number; haz_allow?: number; birth?: string; join_date?: string; role?: string }
    let empRows: EmpRow[] = []
    if (storeFilter) {
      empRows = (await supabaseSelectFilter('employees', `store=ilike.${encodeURIComponent(storeFilter)}`, { order: 'id.asc' })) as EmpRow[]
    } else {
      empRows = (await supabaseSelect('employees', { order: 'id.asc' })) as EmpRow[]
    }

    if (!isDirector) {
      empRows = empRows.filter((e) => !isOfficeStore(String(e.store || '')))
    }

    const attSummary = await getAttendanceSummary(monthStr, storeFilter || undefined)
    const holidayWorkMap = await getHolidayWorkDaysMap(monthStr, storeFilter || undefined)
    const targetDate = new Date(monthStr + '-01')
    const targetMonth = targetDate.getMonth()
    const ssoLimits = getSSOLimitsByYear(targetDate.getFullYear())

    const list: PayrollPreviewRow[] = []

    for (const e of empRows || []) {
      const store = String(e.store || '').trim()
      const name = String(e.name || '').trim()
      if (!name) continue

      const dept = String(e.job || '').trim()
      const role = String(e.role || '').trim()
      const salType = String(e.sal_type || '').trim().toLowerCase()
      const isHourly = ['시급', 'hourly', 'hour', 'part-time', 'part time'].some((x) => salType.includes(x))
      const salAmt = Number(e.sal_amt) || 0
      const posAllow = Number(e.position_allowance) || 0
      const hazAllowPerDay = Number(e.haz_allow) || 0
      const joinDate = e.join_date ? new Date(e.join_date) : new Date()

      let salary = salAmt
      let birthBonus = 0
      if (e.birth) {
        const birth = new Date(e.birth)
        const workYears = (targetDate.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
        if (birth.getMonth() === targetMonth && workYears >= 1) birthBonus = 500
      }

      const attKey = `${store}_${name}`
      const att = attSummary[attKey] || { lateMin: 0, otMin: 0, workMin: 0, workDays: 0 }
      const lateMin = att.lateMin
      const otMin = att.otMin
      const workMin = att.workMin
      const workDays = att.workDays

      let hazAllow = 0
      if ((e.job || '').toLowerCase().includes('kitchen') && hazAllowPerDay > 0) {
        hazAllow = Math.floor(workDays * hazAllowPerDay)
      }

      let lateDed = 0
      let otAmt = 0
      const ot15 = Math.round((otMin / 60) * 10) / 10

      if (isHourly) {
        salary = salAmt > 0 && workMin > 0 ? Math.floor((workMin / 60) * salAmt) : 0
        lateDed = salAmt > 0 && lateMin > 0 ? Math.floor((lateMin / 60) * salAmt) : 0
        otAmt = salAmt > 0 && otMin > 0 ? Math.floor((otMin / 60) * salAmt * OT_MULTIPLIER) : 0
      } else {
        const hoursBase = LATE_DED_HOURS_BASE
        lateDed = hoursBase > 0 && salary > 0 ? Math.floor((lateMin / 60) * (salary / hoursBase)) : 0
        const hourlyRateForOt = hoursBase > 0 && salary > 0 ? salary / hoursBase : 0
        otAmt = hourlyRateForOt > 0 ? Math.floor((otMin / 60) * hourlyRateForOt * OT_MULTIPLIER) : 0
      }

      const contributable = Math.min(salary, ssoLimits.ceiling)
      const sso = Math.min(Math.floor(contributable * 0.05), ssoLimits.maxDed)

      const holidayWorkDays = holidayWorkMap[attKey] || 0
      let holidayPay = 0
      if (holidayWorkDays > 0) {
        if (isHourly && salAmt > 0) holidayPay = Math.floor(holidayWorkDays * 8 * salAmt)
        else if (salary > 0) holidayPay = Math.floor((salary / 30) * holidayWorkDays)
      }

      const income = salary + posAllow + hazAllow + birthBonus + holidayPay + otAmt
      const deduct = lateDed + sso
      const netPay = income - deduct

      list.push({
        store,
        name,
        dept,
        role,
        salary,
        posAllow,
        hazAllow,
        birthBonus,
        holidayPay,
        splBonus: 0,
        ot15,
        otAmt,
        lateMin,
        lateDed,
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
