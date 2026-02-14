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
  const y = year || new Date().getFullYear()
  if (y <= 2025) return { ceiling: 15000, maxDed: 750 }
  if (y <= 2028) return { ceiling: 17500, maxDed: 875 }
  if (y <= 2031) return { ceiling: 20000, maxDed: 1000 }
  return { ceiling: 23000, maxDed: 1150 }
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
  } catch (_) {}
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

type AttSummaryRow = { lateMin: number; otMin: number; workMin: number; workDays: number; workDates: string[] }

/** 귀속월 근태 집계: lateMin, otMin, workMin, workDays, workDates */
async function getAttendanceSummary(monthStr: string): Promise<Record<string, AttSummaryRow>> {
  const startStr = monthStr + '-01'
  const firstDay = new Date(monthStr + '-01T12:00:00')
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0)
  const endStr = lastDay.toISOString().slice(0, 10)
  const nextMonth = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 1)
  const nextMonthStr = nextMonth.getFullYear() + '-' + String(nextMonth.getMonth() + 1).padStart(2, '0') + '-01'

  const attRows = (await supabaseSelectFilter(
    'attendance_logs',
    `log_at=gte.${startStr}&log_at=lt.${nextMonthStr}`,
    { order: 'log_at.asc', limit: 3000 }
  )) as {
    log_at?: string
    store_name?: string
    name?: string
    log_type?: string
    late_min?: number
    ot_min?: number
    break_min?: number
    status?: string
    approved?: string
  }[]

  type DayRec = { inMs: number | null; outMs: number | null; breakMin: number; otMin: number; outApproved: boolean }
  const byDay: Record<string, DayRec> = {}
  const map: Record<string, AttSummaryRow> = {}

  for (const r of attRows || []) {
    const rowDate = toDateStr(r.log_at)
    if (!rowDate || rowDate < startStr || rowDate > endStr) continue
    const store = String(r.store_name || '').trim()
    const name = String(r.name || '').trim()
    if (!store || !name) continue
    const key = store + '_' + name
    const dayKey = rowDate + '_' + key
    if (!map[key]) map[key] = { lateMin: 0, otMin: 0, workMin: 0, workDays: 0, workDates: [] }
    if (!byDay[dayKey]) byDay[dayKey] = { inMs: null, outMs: null, breakMin: 0, otMin: 0, outApproved: false }

    const type = String(r.log_type || '').trim()
    const approval = String(r.approved || '').trim()
    const status = String(r.status || '').trim()
    const isApproved = approval === '승인' || approval === '승인완료'
    const needsApproval = status.includes('위치미확인') || status.includes('승인대기')
    const dt = new Date(r.log_at || '').getTime()

    if (type === '출근') {
      if (!needsApproval || isApproved) map[key].lateMin += Number(r.late_min) || 0
      if (!byDay[dayKey].inMs || dt < (byDay[dayKey].inMs || 0)) byDay[dayKey].inMs = dt
    } else if (type === '퇴근') {
      if (!byDay[dayKey].outMs || dt > (byDay[dayKey].outMs || 0)) {
        byDay[dayKey].outMs = dt
        byDay[dayKey].breakMin = Number(r.break_min) || 0
        byDay[dayKey].outApproved = isApproved
        byDay[dayKey].otMin = Number(r.ot_min) || 0
      }
    }
  }

  for (const dk of Object.keys(byDay)) {
    const v = byDay[dk]
    const attKey = dk.slice(11)
    const rowDate = dk.slice(0, 10)
    if (v.inMs != null && v.outMs != null && v.outApproved && v.outMs > v.inMs) {
      if (!map[attKey]) map[attKey] = { lateMin: 0, otMin: 0, workMin: 0, workDays: 0, workDates: [] }
      const minWork = Math.max(0, Math.floor((v.outMs - v.inMs) / 60000) - (v.breakMin || 0))
      map[attKey].workMin += minWork
      map[attKey].otMin += v.otMin || 0
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
  const monthStr = String(searchParams.get('monthStr') || searchParams.get('month') || '').trim().slice(0, 7)
  let storeFilter = String(searchParams.get('store') || '').trim()
  if (storeFilter === 'All' || storeFilter === '전체') storeFilter = ''

  if (!monthStr || monthStr.length < 7) {
    return NextResponse.json({ success: false, list: [], message: '월(yyyy-MM)을 선택해주세요.' }, { headers })
  }

  try {
    type EmpRow = {
      store?: string
      name?: string
      job?: string
      sal_type?: string
      sal_amt?: number
      position_allowance?: number
      haz_allow?: number
      birth?: string
      join_date?: string
      role?: string
    }
    let empRows: EmpRow[] = []
    if (storeFilter) {
      empRows = (await supabaseSelectFilter(
        'employees',
        `store=ilike.${encodeURIComponent(storeFilter)}`,
        { order: 'id.asc' }
      )) as EmpRow[]
    } else {
      empRows = (await supabaseSelect('employees', { order: 'id.asc' })) as EmpRow[]
    }

    const attSummary = await getAttendanceSummary(monthStr)
    const targetDate = new Date(monthStr + '-01')
    const targetMonth = targetDate.getMonth()
    const payrollYear = targetDate.getFullYear()
    const ssoLimits = getSSOLimitsByYear(payrollYear)
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
      salary: number
      posAllow: number
      hazAllow: number
      birthBonus: number
      holidayPay: number
      otAmt: number
      lateMin: number
      lateDed: number
      sso: number
      netPay: number
    }[] = []

    for (const e of empRows || []) {
      const store = String(e.store || '').trim()
      const name = String(e.name || '').trim()
      if (!name) continue

      const salType = String(e.sal_type || '').trim().toLowerCase()
      const isHourly = ['시급', 'hourly', 'hour', 'part-time', 'part time'].includes(salType)
      const salAmt = Number(e.sal_amt) || 0
      const posAllow = Number(e.position_allowance) || 0
      const hazAllowDaily = Number(e.haz_allow) || 0
      const job = String(e.job || '').trim()
      const isKitchen = job === 'Kitchen' || job === '주방'

      const attKey = store + '_' + name
      const att = attSummary[attKey] || { lateMin: 0, otMin: 0, workMin: 0, workDays: 0, workDates: [] }
      const lateMin = att.lateMin
      const otMin = att.otMin
      const workMin = att.workMin
      const workDays = att.workDays

      let salary = 0
      let lateDed = 0
      let otAmt = 0
      if (isHourly) {
        salary = salAmt > 0 && workMin > 0 ? Math.floor((workMin / 60) * salAmt) : 0
        lateDed = salAmt > 0 && lateMin > 0 ? Math.floor((lateMin / 60) * salAmt) : 0
        otAmt = salAmt > 0 && otMin > 0 ? Math.floor((otMin / 60) * salAmt * OT_MULTIPLIER) : 0
      } else {
        salary = salAmt
        lateDed = LATE_DED_HOURS_BASE > 0 && salary > 0 && lateMin > 0
          ? Math.floor((lateMin / 60) * (salary / LATE_DED_HOURS_BASE))
          : 0
        const hourlyForOt = LATE_DED_HOURS_BASE > 0 && salary ? salary / LATE_DED_HOURS_BASE : 0
        otAmt = hourlyForOt > 0 && otMin > 0 ? Math.floor((otMin / 60) * hourlyForOt * OT_MULTIPLIER) : 0
      }

      let hazAllow = 0
      if (isKitchen && hazAllowDaily > 0 && workDays > 0) {
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
        if (isHourly && salAmt > 0) holidayPay = Math.floor(holidayWorkDays * 8 * salAmt * 2)
        else if (salary > 0) holidayPay = Math.floor((salary / 30) * holidayWorkDays * 2)
      }

      const contributable = Math.min(salary, ssoLimits.ceiling)
      const sso = Math.min(Math.floor(contributable * 0.05), ssoLimits.maxDed)

      const income = salary + posAllow + hazAllow + birthBonus + holidayPay + otAmt
      const deduct = lateDed + sso
      const netPay = Math.max(0, income - deduct)

      list.push({
        store,
        name,
        salary,
        posAllow,
        hazAllow,
        birthBonus,
        holidayPay,
        otAmt,
        lateMin,
        lateDed,
        sso,
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
