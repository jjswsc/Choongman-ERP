import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'

const TZ = 'Asia/Bangkok'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function toTimeStr(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function parsePlanToMinutes(plan: string | null | undefined): number {
  if (!plan || typeof plan !== 'string') return 0
  const m = plan.trim().match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (!m) return 0
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

function plannedHrsFromPlans(planIn: string, planOut: string, planBS: string, planBE: string, planInPrevDay?: boolean): number {
  const inMin = parsePlanToMinutes(planIn)
  let outMin = parsePlanToMinutes(planOut)
  if (planInPrevDay && outMin < inMin) outMin += 24 * 60 // 익일 퇴근(02:00 등) → 26:00=1560분
  const bsMin = parsePlanToMinutes(planBS)
  const beMin = parsePlanToMinutes(planBE)
  if (inMin >= outMin) return 0
  let workMin = outMin - inMin
  if (bsMin && beMin && beMin > bsMin) workMin -= beMin - bsMin
  return Math.max(0, workMin) / 60
}

export interface AttendanceDailyRow {
  date: string
  store: string
  name: string
  inTimeStr: string
  outTimeStr: string
  breakMin: number
  actualWorkHrs: number
  plannedWorkHrs: number
  diffMin: number
  lateMin: number
  otMin: number
  status: string
  approval: string
  /** @deprecated use pendingInId/pendingOutId */
  pendingId: number | null
  pendingInId: number | null
  pendingOutId: number | null
  inStatus?: string
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startDate = String(searchParams.get('startDate') || searchParams.get('start') || '').trim()
  const endDate = String(searchParams.get('endDate') || searchParams.get('end') || '').trim()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  let employeeFilter = String(searchParams.get('employeeFilter') || searchParams.get('employee') || searchParams.get('name') || '').trim()
  const statusFilter = String(searchParams.get('statusFilter') || searchParams.get('status') || 'all').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()
  if (storeFilter === 'null' || storeFilter === 'undefined') storeFilter = ''
  if (employeeFilter === 'null' || employeeFilter === 'undefined') employeeFilter = ''

  if (!startDate || !endDate) {
    return NextResponse.json([], { headers })
  }

  const startStr = startDate.slice(0, 10)
  const endD = new Date(endDate + 'T23:59:59')
  endD.setDate(endD.getDate() + 1)
  const endStr = endD.toISOString().slice(0, 10)

  const isAllStores = !storeFilter || storeFilter === 'All' || storeFilter.toLowerCase() === 'all' || storeFilter === '전체' || storeFilter === '전체 매장'
  const isAllEmployees = !employeeFilter || employeeFilter === 'All' || employeeFilter === '전체 직원'
  const pendingOnly = statusFilter === 'pending'

  const isManager = userRole === 'manager'
  if (isManager && userStore) storeFilter = userStore

  try {
    type AttRow = {
      id?: number
      log_at?: string
      store_name?: string
      name?: string
      log_type?: string
      late_min?: number
      early_min?: number
      ot_min?: number
      break_min?: number
      status?: string
      approved?: string
    }

    let attRows: AttRow[] = []
    if (isAllStores) {
      attRows = (await supabaseSelectFilter(
        'attendance_logs',
        `log_at=gte.${startStr}&log_at=lt.${endStr}`,
        { order: 'log_at.asc', limit: 2000 }
      )) as AttRow[]
    } else {
      attRows = (await supabaseSelectFilter(
        'attendance_logs',
        `store_name=ilike.${encodeURIComponent(storeFilter)}&log_at=gte.${startStr}&log_at=lt.${endStr}`,
        { order: 'log_at.asc', limit: 2000 }
      )) as AttRow[]
    }

    type SchRow = { schedule_date?: string; store_name?: string; name?: string; plan_in?: string; plan_out?: string; break_start?: string; break_end?: string; plan_in_prev_day?: boolean }
    const scheduleMap: Record<string, SchRow> = {}
    const schFilter = `schedule_date=gte.${startStr}&schedule_date=lte.${endStr.slice(0, 10)}`
    const schRows = (await supabaseSelectFilter('schedules', schFilter, { order: 'schedule_date.asc', limit: 1000 })) as SchRow[]
    for (const s of schRows || []) {
      const d = toDateStr(s.schedule_date)
      const store = String(s.store_name || '').trim()
      const nm = String(s.name || '').trim()
      if (d && store && nm) scheduleMap[`${d}|${store}|${nm}`] = s
    }

    const byKey: Record<
      string,
      {
        date: string
        store: string
        name: string
        inTime: string | null
        outTime: string | null
        breakMin: number
        lateMin: number
        earlyMin: number
        otMin: number
        status: string
        approval: string
        inId: number | null
        outId: number | null
        outApproved: string
        inStatus: string
      }
    > = {}

    for (const r of attRows || []) {
      const rowDate = toDateStr(r.log_at)
      if (!rowDate || rowDate < startStr || rowDate >= endStr) continue
      const rowStore = String(r.store_name || '').trim()
      const name = String(r.name || '').trim()
      if (!isAllEmployees && name !== employeeFilter) continue

      const key = `${rowDate}|${rowStore}|${name}`
      if (!byKey[key]) {
        byKey[key] = {
          date: rowDate,
          store: rowStore,
          name,
          inTime: null,
          outTime: null,
          breakMin: 0,
          lateMin: 0,
          earlyMin: 0,
          otMin: 0,
          status: '',
          approval: '대기',
          inId: null,
          outId: null,
          outApproved: '',
          inStatus: '',
        }
      }
      const rec = byKey[key]
      const type = String(r.log_type || '').trim()
      const logAt = r.log_at || ''
      const approved = String(r.approved || '').trim()
      const st = String(r.status || '').trim()
      const isGpsOrForced = /위치미확인|승인대기|강제퇴근/.test(st)
      const needsInApproval = approved === '대기' && (isGpsOrForced || (Number(r.late_min) || 0) > 0)
      const needsOutApproval = approved === '대기' && (isGpsOrForced || (Number(r.ot_min) || 0) > 0)

      if (type === '출근') {
        if (!rec.inTime || logAt < (rec.inTime || '')) {
          rec.inTime = logAt
          rec.lateMin = Number(r.late_min) || 0
          if (needsInApproval) {
            rec.inId = r.id ?? null
            rec.inStatus = st || ''
          }
        }
      } else if (type === '퇴근') {
        if (!rec.outTime || logAt > (rec.outTime || '')) {
          rec.outTime = logAt
          rec.earlyMin = Number(r.early_min) || 0
          rec.otMin = Number(r.ot_min) || 0
          rec.status = st || rec.status
          rec.outApproved = approved || ''
          if (needsOutApproval) rec.outId = r.id ?? null
        }
      } else if (type === '휴식종료') {
        rec.breakMin += Number(r.break_min) || 0
      }
    }

    const result: AttendanceDailyRow[] = []
    for (const rec of Object.values(byKey)) {
      if (!rec.inTime) continue
      let dateForRow = rec.date
      const inTimeForRow = rec.inTime
      let outTimeForRow = rec.outTime
      let breakMinForRow = rec.breakMin
      const lateMinForRow = rec.lateMin
      let earlyMinForRow = rec.earlyMin
      let otMinForRow = rec.otMin
      let statusForRow = rec.status
      let outApprovedForRow = rec.outApproved
      let outIdForRow = rec.outId
      const inIdForRow = rec.inId
      const inStatusForRow = rec.inStatus || ''

      if (!outTimeForRow) {
        const nextDay = (() => {
          const d = new Date(rec.date + 'T12:00:00')
          d.setDate(d.getDate() + 1)
          return d.toISOString().slice(0, 10)
        })()
        const nextRec = byKey[`${nextDay}|${rec.store}|${rec.name}`]
        if (nextRec && nextRec.outTime && !nextRec.inTime) {
          outTimeForRow = nextRec.outTime
          earlyMinForRow = nextRec.earlyMin
          otMinForRow = nextRec.otMin
          statusForRow = nextRec.status || ''
          outApprovedForRow = nextRec.outApproved
          outIdForRow = nextRec.outId
          breakMinForRow += nextRec.breakMin
          dateForRow = nextDay
        }
      }

      const sch = scheduleMap[`${dateForRow}|${rec.store}|${rec.name}`]
      const planIn = sch?.plan_in || ''
      const planOut = sch?.plan_out || ''
      const planBS = sch?.break_start || ''
      const planBE = sch?.break_end || ''
      const planInPrevDay = !!sch?.plan_in_prev_day
      const plannedWorkHrs = plannedHrsFromPlans(planIn, planOut, planBS, planBE, planInPrevDay)

      let actualWorkMin = 0
      if (inTimeForRow && outTimeForRow) {
        const inMs = new Date(inTimeForRow).getTime()
        const outMs = new Date(outTimeForRow).getTime()
        actualWorkMin = Math.max(0, Math.floor((outMs - inMs) / 60000) - breakMinForRow)
      }
      const actualWorkHrs = actualWorkMin / 60
      const plannedWorkMin = plannedWorkHrs * 60
      const diffMin = Math.round(actualWorkMin - plannedWorkMin)

      const approval = outTimeForRow ? (outApprovedForRow || '대기') : '대기'
      const isPending = inIdForRow != null || outIdForRow != null

      if (pendingOnly && !isPending) continue

      result.push({
        date: dateForRow,
        store: rec.store,
        name: rec.name,
        inTimeStr: toTimeStr(inTimeForRow),
        outTimeStr: outTimeForRow ? toTimeStr(outTimeForRow) : '-',
        breakMin: breakMinForRow,
        actualWorkHrs: Math.round(actualWorkHrs * 100) / 100,
        plannedWorkHrs: Math.round(plannedWorkHrs * 100) / 100,
        diffMin,
        lateMin: lateMinForRow,
        otMin: otMinForRow,
        status: outTimeForRow ? statusForRow : '퇴근미기록',
        approval: approval || '대기',
        pendingId: outIdForRow ?? inIdForRow,
        pendingInId: inIdForRow,
        pendingOutId: outIdForRow,
        inStatus: inStatusForRow,
      })
    }

    result.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      if (a.store !== b.store) return a.store.localeCompare(b.store)
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getAttendanceRecordsAdmin:', e)
    return NextResponse.json([], { headers })
  }
}
