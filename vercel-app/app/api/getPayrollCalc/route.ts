import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
} from '@/lib/supabase-server'

const LATE_DED_HOURS_BASE = 208 // 태국 근로기준: 월 208시간
const OT_MULTIPLIER = 1.5

const OFFICE_STORES = ['본사', 'Office', '오피스', '본점']

function isOfficeStore(st: string) {
  const x = String(st || '').trim()
  return x === '본사' || x === 'Office' || x === '오피스' || x.toLowerCase() === 'office'
}

function toDateStr(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function getSSOLimitsByYear(year: number): { ceiling: number; maxDed: number } {
  const y = year
  if (y <= 2025) return { ceiling: 15000, maxDed: 750 }
  if (y <= 2028) return { ceiling: 17500, maxDed: 875 }
  if (y <= 2031) return { ceiling: 20000, maxDed: 1000 }
  return { ceiling: 23000, maxDed: 1150 }
}

const DEFAULT_HOLIDAYS: { date: string; name: string }[] = [
  { date: '-01-01', name: "New Year's Day" },
  { date: '-04-06', name: 'Chakri Day' },
  { date: '-04-13', name: 'Songkran' },
  { date: '-05-01', name: "Labour Day" },
  { date: '-05-04', name: 'Coronation Day' },
  { date: '-08-12', name: "Queen's Birthday" },
  { date: '-10-13', name: "King Memorial Day" },
  { date: '-12-05', name: "King's Birthday" },
  { date: '-12-10', name: 'Constitution Day' },
]

type AttSummary = { lateMin: number; otMin: number; workMin: number; workDays: number; workDates: Set<string> }

function buildAttendanceSummary(
  monthStr: string,
  attRows: { log_at?: string; store_name?: string; name?: string; log_type?: string; late_min?: number; ot_min?: number; break_min?: number; status?: string; approved?: string }[]
): Record<string, AttSummary> {
  const startStr = monthStr + '-01'
  const firstDay = new Date(monthStr + '-01')
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0)
  const endStr = lastDay.toISOString().slice(0, 10)
  const map: Record<string, AttSummary> = {}
  const byDay: Record<string, { inMs: number; outMs: number; breakMin: number; otMin: number; outApproved: boolean }> = {}

  for (const r of attRows || []) {
    const rowDateStr = toDateStr(r.log_at)
    if (!rowDateStr || rowDateStr < startStr || rowDateStr > endStr) continue
    const store = String(r.store_name || '').trim()
    const name = String(r.name || '').trim()
    if (!store || !name) continue
    const key = store + '_' + name
    if (!map[key]) map[key] = { lateMin: 0, otMin: 0, workMin: 0, workDays: 0, workDates: new Set() }
    const dayKey = rowDateStr + '_' + key
    if (!byDay[dayKey]) byDay[dayKey] = { inMs: 0, outMs: 0, breakMin: 0, otMin: 0, outApproved: false }
    const type = String(r.log_type || '').trim()
    const approval = String(r.approved || '').trim()
    const isApproved = approval === '승인' || approval === '승인완료'
    const needsApproval = /위치미확인|승인대기/.test(String(r.status || ''))
    const dt = r.log_at ? new Date(r.log_at).getTime() : 0
    if (type === '출근') {
      if (!needsApproval || isApproved) map[key].lateMin += Number(r.late_min) || 0
      if (!byDay[dayKey].inMs || dt < byDay[dayKey].inMs) byDay[dayKey].inMs = dt
    } else if (type === '퇴근') {
      if (!byDay[dayKey].outMs || dt > byDay[dayKey].outMs) {
        byDay[dayKey].outMs = dt
        byDay[dayKey].breakMin = Number(r.break_min) || 0
        byDay[dayKey].outApproved = isApproved
        byDay[dayKey].otMin = Number(r.ot_min) || 0
      }
    }
  }
  for (const dk of Object.keys(byDay)) {
    const v = byDay[dk]
    if (v.inMs > 0 && v.outMs > 0 && v.outApproved && v.outMs > v.inMs) {
      const storeName = dk.slice(11)
      if (!map[storeName]) map[storeName] = { lateMin: 0, otMin: 0, workMin: 0, workDays: 0, workDates: new Set() }
      const minWork = Math.max(0, Math.floor((v.outMs - v.inMs) / 60000) - (v.breakMin || 0))
      map[storeName].workMin += minWork
      map[storeName].otMin += v.otMin || 0
      map[storeName].workDays += 1
      const dateStr = dk.split('_')[0]
      if (dateStr) map[storeName].workDates.add(dateStr)
    }
  }
  return map
}

export interface PayrollCalcRow {
  id: string
  month: string
  store: string
  name: string
  dept: string
  role: string
  salary: number
  posAllow: number
  hazAllow: number
  birthBonus: number
  holidayPay: number
  holidayWorkDays: number
  splBonus: number
  ot15: number
  ot20: number
  ot30: number
  otAmt: number
  lateMin: number
  lateDed: number
  sso: number
  tax: number
  otherDed: number
  netPay: number
  status: string
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const monthStr = String(searchParams.get('month') || searchParams.get('monthStr') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  if (!monthStr || monthStr.length < 7) {
    return NextResponse.json(
      { success: false, msg: '조회할 월(yyyy-MM)을 선택해주세요.' },
      { status: 400, headers }
    )
  }

  const normMonth = monthStr.slice(0, 7)
  const isAll = !storeFilter || storeFilter === 'All' || storeFilter === '전체'
  const isOffice = storeFilter === 'Office' || storeFilter === '오피스' || storeFilter === '본사'
  const canSeeOffice = userRole.includes('director')

  if (isOffice && !canSeeOffice) {
    return NextResponse.json({ success: true, list: [] }, { headers })
  }

  try {
    const [y, m] = normMonth.split('-').map(Number)
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`

    const startStr = normMonth + '-01'
    const lastDay = new Date(parseInt(normMonth.slice(0, 4), 10), parseInt(normMonth.slice(5, 7), 10) - 1, 0)
    const endStr = lastDay.toISOString().slice(0, 10)

    const [empRows, attRows, phRows, leaveRows] = await Promise.all([
      supabaseSelect('employees', { order: 'id.asc' }) as Promise<{
        id?: number
        store?: string
        name?: string
        job?: string
        role?: string
        sal_type?: string
        sal_amt?: number
        position_allowance?: number
        haz_allow?: number
        birth?: string
        join_date?: string
      }[] | null>,
      supabaseSelectFilter(
        'attendance_logs',
        `log_at=gte.${normMonth}-01&log_at=lt.${nextMonth}`,
        { order: 'log_at.asc', limit: 3000 }
      ) as Promise<{
        log_at?: string
        store_name?: string
        name?: string
        log_type?: string
        late_min?: number
        ot_min?: number
        break_min?: number
        status?: string
        approved?: string
      }[] | null>,
      supabaseSelectFilter('public_holidays', `year=eq.${parseInt(normMonth.slice(0, 4), 10)}`, { order: 'date.asc' }) as Promise<{ date?: string }[] | null>,
      supabaseSelectFilter(
        'leave_requests',
        `leave_date=gte.${startStr}&leave_date=lte.${endStr}`,
        { order: 'leave_date.asc', limit: 1000 }
      ) as Promise<{ store?: string; name?: string; leave_date?: string; type?: string; status?: string }[] | null>,
    ])

    const attSummary = buildAttendanceSummary(normMonth, attRows || [])
    const firstDay = new Date(normMonth + '-01')
    const targetMonth = firstDay.getMonth()
    const year = firstDay.getFullYear()

    // 휴가 집계: 무급휴가 일수, 유급휴가(연차/병가) 일수 (store_name별)
    const unpaidLeaveDaysMap: Record<string, number> = {}
    const paidLeaveDaysMap: Record<string, number> = {}
    for (const lr of leaveRows || []) {
      if (String(lr.status || '').trim() !== '승인') continue
      const store = String(lr.store || '').trim()
      const name = String(lr.name || '').trim()
      const type = String(lr.type || '').trim()
      const dateStr = toDateStr(lr.leave_date)
      if (!store || !name || !dateStr || dateStr < startStr || dateStr > endStr) continue
      const key = store + '_' + name
      if (/무급|unpaid/i.test(type)) {
        unpaidLeaveDaysMap[key] = (unpaidLeaveDaysMap[key] || 0) + 1
      } else if (/연차|병가|annual|sick/i.test(type)) {
        paidLeaveDaysMap[key] = (paidLeaveDaysMap[key] || 0) + 1
      }
    }

    // 해당 월 평일 수 (공휴일 제외) - 결석 산정용
    let holidaySet = new Set<string>()
    if (phRows && phRows.length > 0) {
      const startStr = normMonth + '-01'
      const lastDay = new Date(year, targetMonth + 1, 0)
      const endStr = lastDay.toISOString().slice(0, 10)
      for (const r of phRows) {
        const d = toDateStr(r.date)
        if (d && d >= startStr && d <= endStr) holidaySet.add(d)
      }
    } else {
      for (const h of DEFAULT_HOLIDAYS) {
        const d = year + h.date
        if (d >= normMonth + '-01' && d <= normMonth + '-31') holidaySet.add(d)
      }
    }

    // 평일(월~금) 일수 - 공휴일 제외
    let expectedWorkDays = 0
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, targetMonth, d)
      const dayOfWeek = date.getDay()
      const dateStr = date.toISOString().slice(0, 10)
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateStr)) expectedWorkDays++
    }

    const list: PayrollCalcRow[] = []
    const ssoLimits = getSSOLimitsByYear(year)

    for (const e of empRows || []) {
      const store = String(e.store || '').trim()
      const name = String(e.name || '').trim()
      if (!name) continue

      let include = false
      if (isAll) {
        if (canSeeOffice) include = true
        else if (!isOfficeStore(store)) include = true
      } else {
        if (isOffice) include = isOfficeStore(store)
        else include = store === storeFilter
      }
      if (!include) continue

      const dept = String(e.job || '').trim()
      const role = String(e.role || '').trim()
      const salType = String(e.sal_type || 'Monthly').trim().toLowerCase()
      const isHourly = /시급|hourly|hour|part-time|part time/.test(salType)
      const salAmt = Number(e.sal_amt) || 0
      const posAllow = e.position_allowance != null ? Number(e.position_allowance) : 0
      const hazAllowPerDay = e.haz_allow != null ? Number(e.haz_allow) : 0
      const joinDate = e.join_date ? new Date(e.join_date) : new Date()
      const birth = e.birth ? new Date(e.birth) : null
      const workYears = (firstDay.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
      const birthBonus = birth && birth.getMonth() === targetMonth && workYears >= 1 ? 500 : 0

      const attKey = store + '_' + name
      const att = attSummary[attKey] || { lateMin: 0, otMin: 0, workMin: 0, workDays: 0 }
      const lateMin = att.lateMin
      const otMin = att.otMin
      const workMin = att.workMin
      const workDays = att.workDays

      let salary: number
      let lateDed: number
      let otAmt: number
      if (isHourly) {
        salary = salAmt > 0 && workMin > 0 ? Math.floor((workMin / 60) * salAmt) : 0
        lateDed = salAmt > 0 && lateMin > 0 ? Math.floor((lateMin / 60) * salAmt) : 0
        otAmt = salAmt > 0 && otMin > 0 ? Math.floor((otMin / 60) * salAmt * OT_MULTIPLIER) : 0
      } else {
        salary = salAmt
        lateDed = LATE_DED_HOURS_BASE > 0 && salary ? Math.floor((lateMin / 60) * (salary / LATE_DED_HOURS_BASE)) : 0
        const hourlyForOt = LATE_DED_HOURS_BASE > 0 && salary ? salary / LATE_DED_HOURS_BASE : 0
        otAmt = hourlyForOt > 0 ? Math.floor((otMin / 60) * hourlyForOt * OT_MULTIPLIER) : 0
      }

      const contributable = Math.min(salary, ssoLimits.ceiling)
      const sso = Math.min(Math.floor(contributable * 0.05), ssoLimits.maxDed)

      let holidayWorkDays = 0
      const workDates = att.workDates || new Set<string>()
      for (const d of workDates) {
        if (holidaySet.has(d)) holidayWorkDays++
      }

      const isKitchen = /주방|kitchen|chef|쿡|cook/i.test(dept)
      const hazAllow = isKitchen && hazAllowPerDay > 0 ? Math.floor(workDays * hazAllowPerDay) : 0

      let holidayPay = 0
      if (holidayWorkDays > 0) {
        if (isHourly && salAmt > 0) holidayPay = Math.floor(holidayWorkDays * 8 * salAmt * 2)
        else if (salary > 0) holidayPay = Math.floor((salary / 30) * holidayWorkDays * 2)
      }

      // 무급 휴가 + 결석 공제 (월급제만, 시급제는 미근무일 이미 급여 없음)
      const unpaidLeaveDays = unpaidLeaveDaysMap[attKey] || 0
      const paidLeaveDays = paidLeaveDaysMap[attKey] || 0
      const absenceDays = Math.max(0, expectedWorkDays - workDays - paidLeaveDays)
      const unpaidAbsenceDays = unpaidLeaveDays + absenceDays
      const unpaidAbsenceDed = !isHourly && salary > 0 && unpaidAbsenceDays > 0
        ? Math.floor((salary / 30) * unpaidAbsenceDays)
        : 0

      const income = salary + posAllow + hazAllow + birthBonus + holidayPay + otAmt
      const deduct = lateDed + sso + unpaidAbsenceDed
      const netPay = Math.max(0, income - deduct)
      const ot15 = Math.round((otMin / 60) * 10) / 10

      list.push({
        id: normMonth + '_' + store + '_' + name,
        month: normMonth,
        store,
        name,
        dept,
        role,
        salary,
        posAllow,
        hazAllow,
        birthBonus,
        holidayPay,
        holidayWorkDays,
        splBonus: 0,
        ot15,
        ot20: 0,
        ot30: 0,
        otAmt,
        lateMin,
        lateDed,
        sso,
        tax: 0,
        otherDed: unpaidAbsenceDed,
        netPay,
        status: '대기',
      })
    }

    list.sort((a, b) => (a.store !== b.store ? a.store.localeCompare(b.store) : a.name.localeCompare(b.name)))
    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    const errStack = e instanceof Error ? e.stack : ''
    console.error('getPayrollCalc:', errMsg, errStack)
    return NextResponse.json(
      { success: false, msg: '급여 계산 중 오류가 발생했습니다.', detail: errMsg },
      { status: 500, headers }
    )
  }
}
