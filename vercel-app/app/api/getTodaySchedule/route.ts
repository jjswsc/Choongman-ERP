import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'
import {
  attendanceStoreNamePostgrestVariantsFilter,
  employeeStorePostgrestVariantsFilter,
} from '@/lib/attendance-utils'
import { canonicalAreaFromText, primaryAreaForDisplay } from '@/lib/schedule-area'
import {
  canonicalStoreSegmentForJoinKey,
  scheduleJoinMetaFromRow,
  type EmpRowForRealtimeJoin,
} from '@/lib/today-realtime-join'
import { normalizeEmployeeCodeForMatch, normalizeEmployeeNameForGradeMatch } from '@/lib/employee-display-name'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function formatTime(v: string | null | undefined): string {
  if (v == null || (typeof v === 'string' && !v.trim())) return ''
  const s = String(v).trim()
  const match = s.match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (match) return ('0' + match[1]).slice(-2) + ':' + ('0' + match[2]).slice(-2)
  if (s.indexOf('T') !== -1) {
    const tPart = s.split('T')[1]
    if (tPart) {
      const m = tPart.match(/(\d{1,2}):(\d{2})/)
      if (m) return ('0' + m[1]).slice(-2) + ':' + m[2]
    }
  }
  return s.length >= 5 && s.charAt(2) === ':' ? s.substring(0, 5) : s
}

type TodayScheduleOutRow = {
  date: string
  store: string
  name: string
  nick: string
  pIn: string
  pOut: string
  pBS: string
  pBE: string
  area: string
  plan_in_prev_day: boolean
  leaveType?: string
  joinKey: string
  employeeCode?: string
  employeeId?: number
}

function todayScheduleMergeKey(row: TodayScheduleOutRow): string {
  const day = String(row.date || '').trim().slice(0, 10)
  const storeSeg = canonicalStoreSegmentForJoinKey(String(row.store || ''))
  const code = normalizeEmployeeCodeForMatch(String(row.employeeCode ?? ''))
  if (code) return `${day}|${storeSeg}|c:${code}`
  const idNum =
    row.employeeId != null && Number.isFinite(Number(row.employeeId))
      ? Math.floor(Number(row.employeeId))
      : 0
  if (idNum > 0) return `${day}|${storeSeg}|id:${idNum}`
  const rawName = String(row.name || row.nick || '').trim()
  const normName = normalizeEmployeeNameForGradeMatch(rawName)
  return `${day}|${storeSeg}|n:${normName || rawName}`
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const dateStr = String(searchParams.get('date') || searchParams.get('dateStr') || '').trim().slice(0, 10)

  if (!dateStr || dateStr.length < 10) {
    return NextResponse.json([], { headers })
  }

  try {
    const isAll = !store || store.toLowerCase() === 'all' || store === '전체' || store === '전체 매장'
    type SchRow = {
      schedule_date?: string
      store_name?: string
      name?: string
      employee_id?: number | null
      plan_in?: string
      plan_out?: string
      break_start?: string
      break_end?: string
      memo?: string
      plan_in_prev_day?: boolean
    }
    const scheduleSelectWithEid =
      'schedule_date,store_name,name,employee_id,plan_in,plan_out,break_start,break_end,memo,plan_in_prev_day'
    const scheduleSelectLegacy =
      'schedule_date,store_name,name,plan_in,plan_out,break_start,break_end,memo,plan_in_prev_day'

    const fetchScheduleChunk = async (filter: string): Promise<SchRow[]> => {
      try {
        return (await supabaseSelectFilter('schedules', filter, {
          order: 'schedule_date.asc',
          limit: 500,
          select: scheduleSelectWithEid,
        })) as SchRow[]
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (/employee_id|42703|column/i.test(em)) {
          return (await supabaseSelectFilter('schedules', filter, {
            order: 'schedule_date.asc',
            limit: 500,
            select: scheduleSelectLegacy,
          })) as SchRow[]
        }
        throw e
      }
    }

    const dateFilter = `schedule_date=eq.${dateStr}`
    let scheduleRows: SchRow[] = []
    if (isAll) {
      scheduleRows = await fetchScheduleChunk(dateFilter)
    } else {
      const filter = `${dateFilter}&${attendanceStoreNamePostgrestVariantsFilter(store)}`
      scheduleRows = await fetchScheduleChunk(filter)
    }
    // 자정 넘는 근무: schedule_date=다음날 + plan_in_prev_day → 당일에도 포함 (당일 18:00~익일 02:00 등)
    const nextDay = (() => {
      const d = new Date(dateStr + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      return d.toISOString().slice(0, 10)
    })()
    const prevDayFilter = `schedule_date=eq.${nextDay}&plan_in_prev_day=eq.true`
    let prevDayRows: SchRow[] = []
    if (isAll) {
      prevDayRows = await fetchScheduleChunk(prevDayFilter)
    } else {
      const filter = `${prevDayFilter}&${attendanceStoreNamePostgrestVariantsFilter(store)}`
      prevDayRows = await fetchScheduleChunk(filter)
    }
    scheduleRows = [...scheduleRows, ...prevDayRows]

    let empList: EmpRowForRealtimeJoin[] = []
    const empSelectCandidates = [
      'id,name,nick,store,job,employee_code,extra_stores',
      'id,name,nick,store,employee_code,extra_stores',
      'id,name,nick,store,job,employee_code',
      'name,nick,store,job,employee_code',
      'id,name,nick,store,job',
      'name,nick,store,job',
    ] as const
    for (const sel of empSelectCandidates) {
      try {
        empList = (await supabaseSelect('employees', { order: 'id.asc', limit: 5000, select: sel })) as EmpRowForRealtimeJoin[]
        break
      } catch {
        continue
      }
    }
    const nameToNick: Record<string, string> = {}
    const storeNameToJob: Record<string, string> = {}
    for (const e of empList || []) {
      const nm = String(e.name || '').trim()
      const st = String(e.store || '').trim()
      if (nm) {
        nameToNick[nm] = String(e.nick || e.name || nm).trim() || nm
        if (st) storeNameToJob[st + '|' + nm] = String(e.job || '').trim()
      }
    }

    const scheduleKeySet = new Set<string>()
    for (const r of scheduleRows || []) {
      const d = toDateStr(r.schedule_date)
      const st = String(r.store_name || '').trim()
      const nm = String(r.name || '').trim()
      if (d && st && nm) scheduleKeySet.add(`${d}|${st}|${nm}`)
    }

    let leaveFilter = `leave_date=eq.${dateStr}&status=eq.승인`
    if (!isAll && store) {
      leaveFilter += `&${employeeStorePostgrestVariantsFilter(store)}`
    }
    const leaveRows = (await supabaseSelectFilter(
      'leave_requests',
      leaveFilter,
      { order: 'leave_date.asc', limit: 100, select: 'store,name,leave_date,type' }
    )) as { store?: string; name?: string; leave_date?: string; type?: string }[]
    const leaveMerged: TodayScheduleOutRow[] = []
    for (const lr of leaveRows || []) {
      const storeVal = String(lr.store || '').trim()
      const nameVal = String(lr.name || '').trim()
      const key = `${dateStr}|${storeVal}|${nameVal}`
      if (scheduleKeySet.has(key)) continue
      const type = String(lr.type || '').trim() || '휴가'
      const area = canonicalAreaFromText(storeNameToJob[storeVal + '|' + nameVal] || '')
      const leaveMeta = scheduleJoinMetaFromRow(storeVal, nameVal, undefined, empList || [])
      leaveMerged.push({
        date: dateStr,
        store: storeVal,
        name: nameVal,
        nick: nameToNick[nameVal] || nameVal,
        pIn: '09:00',
        pOut: '18:00',
        pBS: '',
        pBE: '',
        area: area || 'Service',
        plan_in_prev_day: false,
        leaveType: type,
        joinKey: leaveMeta.joinKey,
        employeeCode: leaveMeta.employeeCode,
      })
    }

    const list: TodayScheduleOutRow[] = (scheduleRows || []).map((r) => {
      const st = String(r.store_name || '').trim()
      const nm = String(r.name || '').trim()
      const area = primaryAreaForDisplay(r.memo, storeNameToJob[st + '|' + nm])
      const meta = scheduleJoinMetaFromRow(st, nm, r.employee_id ?? null, empList || [])
      return {
        date: toDateStr(r.schedule_date),
        store: st,
        name: nm,
        nick: nameToNick[String(r.name || '').trim()] || String(r.name || '').trim(),
        pIn: formatTime(r.plan_in) || '09:00',
        pOut: formatTime(r.plan_out) || '18:00',
        pBS: formatTime(r.break_start),
        pBE: formatTime(r.break_end),
        area,
        plan_in_prev_day: !!r.plan_in_prev_day,
        joinKey: meta.joinKey,
        employeeCode: meta.employeeCode,
        employeeId:
          r.employee_id != null && Number.isFinite(Number(r.employee_id))
            ? Math.floor(Number(r.employee_id))
            : undefined,
      }
    })

    const merged = [...list, ...leaveMerged]
    const dedup: Record<string, TodayScheduleOutRow> = {}
    for (const row of merged) {
      const k = todayScheduleMergeKey(row)
      const prev = dedup[k]
      if (!prev) {
        dedup[k] = row
        continue
      }
      const incomingIsLeave = !!row.leaveType
      const prevIsLeave = !!prev.leaveType
      if (incomingIsLeave && !prevIsLeave) {
        dedup[k] = row
        continue
      }
      if (!incomingIsLeave && prevIsLeave) {
        continue
      }
      dedup[k] = {
        ...prev,
        ...row,
        joinKey: row.joinKey || prev.joinKey,
        employeeCode: row.employeeCode || prev.employeeCode,
        employeeId: row.employeeId || prev.employeeId,
        leaveType: row.leaveType || prev.leaveType,
      }
    }
    const deduped = Object.values(dedup).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      if (a.store !== b.store) return a.store.localeCompare(b.store)
      if (!!a.leaveType !== !!b.leaveType) return a.leaveType ? -1 : 1
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
    return NextResponse.json(deduped, { headers })
  } catch (e) {
    console.error('getTodaySchedule:', e)
    return NextResponse.json([], { headers })
  }
}
