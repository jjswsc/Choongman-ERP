import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { ATTENDANCE_LOG_ADMIN_GRID_COLS } from '@/lib/postgrest-narrow-select'
import {
  bangkokDateRangeToUtc,
  plannedWorkMinutesFromPlans,
  resolveScheduleForAttendanceDay,
  scheduleDateKey,
} from '@/lib/attendance-utils'
import { otMinutesForPayroll } from '@/lib/payroll-utils'

const TZ = 'Asia/Bangkok'

/** log_at(UTC ISO) → 방콕 기준 날짜 YYYY-MM-DD */
function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** log_at(UTC ISO) → 방콕 기준 시간 HH:mm */
function toTimeStr(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
}

/** log_at(UTC ISO) → 방콕 기준 시간 HH:mm:ss (출근=퇴근 여부 확인용) */
function toTimeStrWithSec(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

/** 방콕 기준 날짜(YYYY-MM-DD)에서 N일 더한 날짜 */
function addDay(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** log_at(ISO) → 방콕 기준 시각의 시(hour) 0~23 */
function getBangkokHour(iso: string): number {
  if (!iso) return 12
  const d = new Date(iso)
  const str = d.toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false })
  return parseInt(str, 10) || 0
}

/** Mr./Ms./Mrs. 접두어 제거 - 스케줄(이름만)과 근태(호칭 포함) 매칭용 */
function normalizeNameForSchedule(name: string): string {
  return String(name || '').trim().replace(/^(Mr\.|Ms\.|Mrs\.)\s*/i, '').trim()
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
  earlyMin?: number
  otMin: number
  status: string
  approval: string
  /** @deprecated use pendingInId/pendingOutId */
  pendingId: number | null
  pendingInId: number | null
  pendingOutId: number | null
  /** 퇴근 로그 id (승인 여부 무관, 조정 반영 시 사용) */
  outLogId: number | null
  inStatus?: string
  /** 파트타임/시급이면 계획 0이어도 빨간 행 표시 안 함 */
  isPartTime?: boolean
}

export const dynamic = 'force-dynamic' // 조정 반영 후 최신 데이터 조회를 위해 캐시 비활성화

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
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
  const endStr = endDate.slice(0, 10)
  const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
  // 자정 넘김 퇴근(익일 00:00~06:59 방콕) 포함: log_at 조회 끝을 익일 07:00 방콕(= 익일 00:00 UTC)까지 연장
  const logEndISOExclusive = addDay(endStr, 1) + 'T00:00:00.000Z'

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

    // 급여(getPayrollCalc)와 동일 구간의 로그를 모두 수집. limit 2000만 쓰면 log_at.asc 앞쪽 행만 오고
    // 직원 필터는 루프에서 적용되어 말일·특정 직원 행이 누락될 수 있음(지각 공제는 있는데 근태 표에 없음).
    const attLogFilterParts = [
      `log_at=gte.${encodeURIComponent(startISO)}`,
      `log_at=lt.${encodeURIComponent(logEndISOExclusive)}`,
    ]
    if (!isAllStores && storeFilter) {
      attLogFilterParts.unshift(`store_name=ilike.${encodeURIComponent(storeFilter)}`)
    }
    if (!isAllEmployees && employeeFilter) {
      attLogFilterParts.push(`name=eq.${encodeURIComponent(employeeFilter)}`)
    }
    const attLogFilter = attLogFilterParts.join('&')
    const attRows = (await supabaseSelectFilterAllPages('attendance_logs', attLogFilter, {
      order: 'log_at.asc',
      select: ATTENDANCE_LOG_ADMIN_GRID_COLS,
      pageSize: 2500,
      maxRows: 120_000,
    })) as AttRow[]

    /** 파트타임/시급 직원 식별: store|name (정규화 포함) → 계획 0이어도 빨간 행 미적용 */
    const partTimeKeys = new Set<string>()
    try {
      const empRows = (await supabaseSelect('employees', { select: 'store,name,job,sal_type', limit: 500 })) as { store?: string; name?: string; job?: string; sal_type?: string }[]
      const partTimeSal = /시급|hourly|hour|part-time|part\s*time/i
      const partTimeJob = /part|파트|part-time/i
      for (const e of empRows || []) {
        const store = String(e.store || '').trim()
        const nm = String(e.name || '').trim()
        if (!store || !nm) continue
        const job = String(e.job || '').trim()
        const salType = String(e.sal_type || '').trim()
        const isPart = partTimeSal.test(salType) || partTimeJob.test(job)
        if (isPart) {
          partTimeKeys.add(`${store}|${nm}`)
          partTimeKeys.add(`${store}|${normalizeNameForSchedule(nm)}`)
        }
      }
    } catch (_) { /* ignore */ }

    type SchRow = { schedule_date?: string; store_name?: string; name?: string; plan_in?: string; plan_out?: string; break_start?: string; break_end?: string; plan_in_prev_day?: boolean }
    const scheduleMap: Record<string, SchRow> = {}
    /** schedules: 고정 limit는 데이터 증가 시 항상 부족 → Range 페이지로 전부 수집. 매장 필터로 트래픽·메모리 절감 */
    const schParts = [`schedule_date=gte.${startStr}`, `schedule_date=lte.${endStr.slice(0, 10)}`]
    if (!isAllStores && storeFilter) {
      schParts.push(`store_name=ilike.${encodeURIComponent(storeFilter)}`)
    }
    const schFilter = schParts.join('&')
    const schRows = (await supabaseSelectFilterAllPages('schedules', schFilter, {
      order: 'schedule_date.asc',
      pageSize: 8000,
      maxRows: 2_000_000,
    })) as SchRow[]
    for (const s of schRows || []) {
      const d = scheduleDateKey(s.schedule_date)
      const store = String(s.store_name || '').trim()
      const nm = String(s.name || '').trim()
      if (d && store && nm) {
        scheduleMap[`${d}|${store}|${nm}`] = s
        const nmNorm = normalizeNameForSchedule(nm)
        if (nmNorm !== nm) scheduleMap[`${d}|${store}|${nmNorm}`] = s
      }
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
        otMin: number | null // null = DB에 미설정, 계산값 사용
        status: string
        approval: string
        inId: number | null
        outId: number | null
        outLogId: number | null
        outApproved: string
        inStatus: string
      }
    > = {}

    for (const r of attRows || []) {
      const rowDate = toDateStr(r.log_at)
      const type = String(r.log_type || '').trim()
      const logAt = r.log_at || ''
      if (!rowDate || rowDate < startStr) continue
      // 조회 구간 밖 날짜: 익일 새벽 퇴근(자정 넘김)만 허용 → 전날 행에 붙이기 위함
      if (rowDate > endStr) {
        const isOvernightOutForRange = type === '퇴근' && getBangkokHour(logAt) <= 7 && rowDate === addDay(endStr, 1)
        if (!isOvernightOutForRange) continue
      }
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
          otMin: null,
          status: '',
          approval: '대기',
          inId: null,
          outId: null,
          outLogId: null,
          outApproved: '',
          inStatus: '',
        }
      }
      const rec = byKey[key]
      const approved = String(r.approved || '').trim()
      const st = String(r.status || '').trim()
      const isGpsOrForced = /위치미확인|승인대기|강제퇴근/.test(st)
      const needsInApproval = approved === '대기' && (isGpsOrForced || (Number(r.late_min) || 0) > 0)
      const needsOutApproval = approved === '대기' && (isGpsOrForced || (Number(r.ot_min) || 0) > 0 || (Number(r.early_min) || 0) > 0)

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
        const bangkokHour = getBangkokHour(logAt)
        const isOvernightOut = bangkokHour < 7
        const prevDayKey = `${addDay(rowDate, -1)}|${rowStore}|${name}`
        const prevRec = byKey[prevDayKey]

        if (isOvernightOut && prevRec?.inTime && !prevRec.outTime) {
          prevRec.outTime = logAt
          prevRec.earlyMin = Number(r.early_min) || 0
          prevRec.otMin = r.ot_min != null ? Number(r.ot_min) : null
          prevRec.status = st || prevRec.status
          prevRec.outApproved = approved || ''
          if (needsOutApproval) prevRec.outId = r.id ?? null
          prevRec.outLogId = r.id ?? null
        } else if (!isOvernightOut && (!rec.outTime || logAt > (rec.outTime || ''))) {
          rec.outTime = logAt
          rec.earlyMin = Number(r.early_min) || 0
          rec.otMin = r.ot_min != null ? Number(r.ot_min) : null
          rec.status = st || rec.status
          rec.outApproved = approved || ''
          if (needsOutApproval) rec.outId = r.id ?? null
          rec.outLogId = r.id ?? null
        }
      } else if (type === '휴식종료') {
        rec.breakMin += Number(r.break_min) || 0
      }
    }

    const result: AttendanceDailyRow[] = []
    for (const rec of Object.values(byKey)) {
      if (!rec.inTime) continue
      const dateForRow = rec.date
      const inTimeForRow = rec.inTime
      let outTimeForRow = rec.outTime
      let breakMinForRow = rec.breakMin
      const lateMinForRow = rec.lateMin
      let earlyMinForRow = rec.earlyMin
      let otMinForRow = rec.otMin
      let statusForRow = rec.status
      let outApprovedForRow = rec.outApproved
      let outIdForRow = rec.outId
      let outLogIdForRow = rec.outLogId
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
          outLogIdForRow = nextRec.outLogId
          breakMinForRow += nextRec.breakMin
          // 자정 넘김 근무: 행은 출근한 날(오늘) 기준 유지, 퇴근만 익일 기록 사용
        }
      }

      let actualWorkMin = 0
      if (inTimeForRow && outTimeForRow) {
        const inMs = new Date(inTimeForRow).getTime()
        const outMs = new Date(outTimeForRow).getTime()
        actualWorkMin = Math.max(0, Math.floor((outMs - inMs) / 60000) - breakMinForRow)
      }

      const sch = resolveScheduleForAttendanceDay(
        dateForRow,
        rec.store,
        rec.name,
        scheduleMap,
        actualWorkMin,
        'payroll'
      )
      const planIn = sch?.plan_in || ''
      const planOut = sch?.plan_out || ''
      const planBS = sch?.break_start || ''
      const planBE = sch?.break_end || ''
      const planInPrevDay = !!sch?.plan_in_prev_day
      const plannedWorkMin = sch
        ? plannedWorkMinutesFromPlans(planIn, planOut, planBS, planBE, planInPrevDay)
        : 0
      const plannedWorkHrs = Math.round((plannedWorkMin / 60) * 100) / 100
      const actualWorkHrs = actualWorkMin / 60
      const diffMin = Math.round(actualWorkMin - plannedWorkMin)

      const approval = outTimeForRow ? (outApprovedForRow || '대기') : '대기'
      const isPending = inIdForRow != null || outIdForRow != null

      // 실제 근무시간이 0이면 지각 의미 없음. 스케줄 대비 순증 근무(diff>0)면 지각 분 숨김(급여 지각 공제와 동일)
      const rawLateMin = actualWorkMin <= 0 ? 0 : lateMinForRow
      const effectiveLateMin = plannedWorkMin > 0 && diffMin > 0 ? 0 : rawLateMin
      // 연장: 차이가 음수(조퇴)면 OT 없음. 그 외는 DB 조정값 또는 스케줄 차이(급여 집계와 동일)
      const effectiveOtMin =
        actualWorkMin <= 0 || plannedWorkMin <= 0 || diffMin < 0
          ? 0
          : otMinForRow != null
            ? otMinForRow
            : Math.max(0, diffMin)
      const displayOtMin =
        diffMin < 0
          ? 0
          : otMinForRow != null
            ? effectiveOtMin
            : otMinutesForPayroll(Math.max(0, diffMin))

      if (pendingOnly && !isPending) continue

      // 상태 표시: 퇴근 없음→퇴근미기록, 강제퇴근(승인)은 그대로(재계산 버튼 노출), 차이 음수→조퇴, 연장 30분 이상→연장, 그 외 DB값 또는 정상
      const displayStatus =
        !outTimeForRow
          ? '퇴근미기록'
          : (statusForRow && String(statusForRow).includes('강제퇴근(승인)'))
            ? statusForRow
            : diffMin < 0
              ? '조퇴'
              : displayOtMin >= 30
                ? '연장'
                : statusForRow === '조퇴'
                  ? '정상'
                  : statusForRow

      const isPartTime =
        partTimeKeys.has(`${rec.store}|${rec.name}`) ||
        partTimeKeys.has(`${rec.store}|${normalizeNameForSchedule(rec.name)}`)
      // 출근·퇴근이 동일하게 보이면(같은 분 또는 실제 동일) 초까지 표시해 오입력/앱 버그 확인 가능하도록
      const inStr = toTimeStr(inTimeForRow)
      const outStr = outTimeForRow ? toTimeStr(outTimeForRow) : '-'
      const sameMinute = outTimeForRow && inStr === outStr
      result.push({
        date: dateForRow,
        store: rec.store,
        name: rec.name,
        inTimeStr: sameMinute ? toTimeStrWithSec(inTimeForRow) : inStr,
        outTimeStr: outTimeForRow ? (sameMinute ? toTimeStrWithSec(outTimeForRow) : outStr) : '-',
        breakMin: breakMinForRow,
        actualWorkHrs: Math.round(actualWorkHrs * 100) / 100,
        plannedWorkHrs: Math.round(plannedWorkHrs * 100) / 100,
        diffMin,
        lateMin: effectiveLateMin,
        earlyMin: plannedWorkMin > 0 && diffMin < 0 ? Math.abs(diffMin) : 0,
        otMin: displayOtMin,
        status: displayStatus,
        approval: approval || '대기',
        pendingId: outIdForRow ?? inIdForRow,
        pendingInId: inIdForRow,
        pendingOutId: outIdForRow,
        outLogId: outLogIdForRow ?? null,
        inStatus: inStatusForRow,
        isPartTime,
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
