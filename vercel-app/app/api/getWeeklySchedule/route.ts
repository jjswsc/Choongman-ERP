import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'
import { attendanceStoreNamePostgrestVariantsFilter } from '@/lib/attendance-utils'
import {
  findStaffForScheduleSlotName,
  formatEmployeeDisplayName,
  normalizeEmployeeCodeForMatch,
  normalizeEmployeeNameFields,
  type StaffRowForScheduleMatch,
} from '@/lib/employee-display-name'
import { parseExtraStoresColumn } from '@/lib/extra-stores-column'
import { storeMatches } from '@/lib/admin-employee-store-access'
import {
  canonicalAreaFromText,
  memoMatchesAreaFilter,
  primaryAreaForDisplay,
} from '@/lib/schedule-area'

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

type EmpRow = {
  id?: number
  name?: string
  nick?: string
  store?: string
  job?: string
  name_title?: string
  extra_stores?: unknown
  employee_code?: string | null
}

function toStaffLite(e: EmpRow): StaffRowForScheduleMatch {
  const rawName = String(e.name || '').trim()
  const rawTitle = String(e.name_title || '').trim()
  const { name: normName } = normalizeEmployeeNameFields(rawName, rawTitle)
  const nickVal = String(e.nick || normName || rawName).trim() || rawName
  return { name: normName || rawName, nick: nickVal }
}

/** 휴가/스케줄 매장이 직원의 소속(또는 extra_stores)과 맞는지 */
function empWorksAtStore(e: EmpRow, leaveOrScheduleStore: string): boolean {
  const target = String(leaveOrScheduleStore || '').trim()
  if (!target) return false
  const primary = String(e.store || '').trim()
  if (storeMatches(primary, target)) return true
  return parseExtraStoresColumn(e.extra_stores).some((ex) => storeMatches(ex, target))
}

/** 월요일 날짜로 해당 주 일요일까지 구간 계산 (타임존 영향 없이 로컬 날짜만 사용) */
function getWeekRange(mondayStr: string): { start: string; end: string } {
  const m = mondayStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return { start: '', end: '' }
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  const startDate = new Date(y, mo - 1, d)
  const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)
  const fmt = (date: Date) => {
    const yy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  }
  return { start: fmt(startDate), end: fmt(endDate) }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const mondayStr = String(searchParams.get('monday') || searchParams.get('weekMonday') || '').trim().slice(0, 10)
  const areaFilter = String(searchParams.get('area') || searchParams.get('areaFilter') || 'All').trim()

  if (!mondayStr || mondayStr.length < 10) {
    return NextResponse.json([], { headers })
  }

  const { start, end } = getWeekRange(mondayStr)
  if (!start || !end) {
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
    let scheduleRows: SchRow[] = []
    const dateFilter = `schedule_date=gte.${start}&schedule_date=lte.${end}`
    if (isAll) {
      scheduleRows = (await supabaseSelectFilter('schedules', dateFilter, { order: 'schedule_date.asc', limit: 500 })) as SchRow[]
    } else {
      const filter = `${dateFilter}&${attendanceStoreNamePostgrestVariantsFilter(store)}`
      scheduleRows = (await supabaseSelectFilter('schedules', filter, { order: 'schedule_date.asc', limit: 500 })) as SchRow[]
    }

    let empList: EmpRow[] = []
    const empSelectCandidates = [
      'id,name,nick,store,job,name_title,extra_stores,employee_code',
      'id,name,nick,store,job,name_title,extra_stores',
      'id,name,nick,store,job,name_title',
      'id,name,nick,store,job',
      'name,nick,store,job,name_title,extra_stores',
      'name,nick,store,job,name_title',
      'name,nick,store,job',
    ] as const
    for (const sel of empSelectCandidates) {
      try {
        empList = (await supabaseSelect('employees', { order: 'id.asc', limit: 5000, select: sel })) as EmpRow[]
        break
      } catch {
        continue
      }
    }
    const nameToNick: Record<string, string> = {}
    const storeNameToJob: Record<string, string> = {}
    const empIdToNick = new Map<number, string>()
    const codeToNick = new Map<string, string>()
    const staffAtStoreCache = new Map<string, StaffRowForScheduleMatch[]>()

    const getStaffAtStore = (storeName: string): StaffRowForScheduleMatch[] => {
      const key = String(storeName || '').trim()
      let v = staffAtStoreCache.get(key)
      if (v) return v
      v = (empList || []).filter((e) => empWorksAtStore(e, key)).map(toStaffLite)
      staffAtStoreCache.set(key, v)
      return v
    }

    const findEmpForScheduleRow = (slotStore: string, slotName: string, employeeId: unknown): EmpRow | undefined => {
      const eid = employeeId != null && Number.isFinite(Number(employeeId)) ? Math.floor(Number(employeeId)) : 0
      if (eid > 0) {
        const hit = (empList || []).find((e) => e.id != null && Math.floor(Number(e.id)) === eid)
        if (hit) return hit
      }
      const roster = getStaffAtStore(slotStore)
      const match = findStaffForScheduleSlotName(roster, String(slotName || '').trim())
      if (!match) return undefined
      return (empList || []).find((e) => {
        const lite = toStaffLite(e)
        return lite.name === match.name && lite.nick === match.nick
      })
    }

    const resolveScheduleDisplayNick = (slotStore: string, slotName: string, slotEmployeeId: unknown): string => {
      const nm = String(slotName || '').trim()
      if (!nm) return ''
      const eid = slotEmployeeId != null && Number.isFinite(Number(slotEmployeeId)) ? Math.floor(Number(slotEmployeeId)) : 0
      if (eid > 0) {
        const byId = empIdToNick.get(eid)
        if (byId) return byId
      }
      const ck = normalizeEmployeeCodeForMatch(nm)
      if (ck) {
        const byCode = codeToNick.get(ck)
        if (byCode) return byCode
      }
      const roster = getStaffAtStore(slotStore)
      const hit = findStaffForScheduleSlotName(roster, nm)
      if (hit) return hit.nick
      return nameToNick[nm] || nm
    }

    for (const e of empList || []) {
      const rawName = String(e.name || '').trim()
      const rawTitle = String(e.name_title || '').trim()
      const { name: normName } = normalizeEmployeeNameFields(rawName, rawTitle)
      const st = String(e.store || '').trim()
      const nickVal = String(e.nick || normName || rawName).trim() || rawName
      const lite = toStaffLite(e)
      const idNum = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
      if (idNum > 0) empIdToNick.set(idNum, lite.nick)
      const codeKey = normalizeEmployeeCodeForMatch(String(e.employee_code ?? ''))
      if (codeKey) codeToNick.set(codeKey, lite.nick)
      const keys = new Set<string>()
      if (rawName) keys.add(rawName)
      if (normName) keys.add(normName)
      const displayFull = formatEmployeeDisplayName(normName, rawTitle).trim()
      if (displayFull) keys.add(displayFull)
      for (const k of keys) {
        nameToNick[k] = nickVal
        if (st) storeNameToJob[st + '|' + k] = String(e.job || '').trim()
      }
    }

    const scheduleKeySet = new Set<string>()
    for (const r of scheduleRows || []) {
      const d = toDateStr(r.schedule_date)
      const st = String(r.store_name || '').trim()
      const nm = String(r.name || '').trim()
      if (d && st && nm) scheduleKeySet.add(`${d}|${st}|${nm}`)
    }

    // 승인된 휴가: schedules에 없고 leave에만 있는 (date, store, name) → 휴가 행 병합
    let leaveFilter = `leave_date=gte.${start}&leave_date=lte.${end}&status=eq.승인`
    if (!isAll && store) {
      leaveFilter += `&store=ilike.${encodeURIComponent(store)}`
    }
    const leaveRows = (await supabaseSelectFilter(
      'leave_requests',
      leaveFilter,
      { order: 'leave_date.asc', limit: 200, select: 'store,name,leave_date,type' }
    )) as { store?: string; name?: string; leave_date?: string; type?: string }[]
    const leaveMerged: { date: string; store: string; name: string; nick: string; pIn: string; pOut: string; pBS: string; pBE: string; area: string; plan_in_prev_day: boolean; leaveType?: string }[] = []
    for (const lr of leaveRows || []) {
      const date = toDateStr(lr.leave_date)
      const leaveStoreStr = String(lr.store || '').trim()
      const name = String(lr.name || '').trim()
      const type = String(lr.type || '').trim() || '휴가'
      if (!date || !leaveStoreStr || !name || date < start || date > end) continue
      const key = `${date}|${leaveStoreStr}|${name}`
      if (scheduleKeySet.has(key)) continue // 이미 스케줄에 있으면 휴가 행 추가 안 함

      // 휴가 신청 매장에 실제 소속(또는 extra_stores)인 직원만 병합 — 소속이 다른 매장으로 잘못 신청된 휴가는 단일 매장 조회에서 제외
      const rosterAtLeaveStore = (empList || []).filter((e) => empWorksAtStore(e, leaveStoreStr))
      const matchedEmp = rosterAtLeaveStore.find(
        (e) => findStaffForScheduleSlotName([toStaffLite(e)], name) !== undefined
      )
      if (!isAll && !matchedEmp) continue

      const area = matchedEmp
        ? canonicalAreaFromText(matchedEmp.job || '')
        : canonicalAreaFromText(storeNameToJob[leaveStoreStr + '|' + name] || '')
      const nickOut = resolveScheduleDisplayNick(leaveStoreStr, name, matchedEmp?.id ?? null)

      leaveMerged.push({
        date,
        store: leaveStoreStr,
        name,
        nick: nickOut,
        pIn: '09:00',
        pOut: '18:00',
        pBS: '',
        pBE: '',
        area: area || 'Service',
        plan_in_prev_day: false,
        leaveType: type,
      })
    }

    type RowWithMemo = {
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
      memo?: string | null
    }

    let list: RowWithMemo[] = (scheduleRows || []).map((r) => {
      const st = String(r.store_name || '').trim()
      const nm = String(r.name || '').trim()
      const matched = findEmpForScheduleRow(st, nm, r.employee_id)
      const area = primaryAreaForDisplay(r.memo, matched?.job)
      return {
        date: toDateStr(r.schedule_date),
        store: st,
        name: nm,
        nick: resolveScheduleDisplayNick(st, nm, r.employee_id),
        pIn: formatTime(r.plan_in) || '09:00',
        pOut: formatTime(r.plan_out) || '18:00',
        pBS: formatTime(r.break_start),
        pBE: formatTime(r.break_end),
        area,
        plan_in_prev_day: !!r.plan_in_prev_day,
        memo: r.memo,
      }
    })

    list = [...list, ...leaveMerged]

    if (areaFilter && areaFilter.toLowerCase() !== 'all' && areaFilter !== '전체') {
      list = list.filter((r) => {
        const lt = r.leaveType
        if (lt) return (r.area || 'Service') === areaFilter
        return memoMatchesAreaFilter(r.memo, areaFilter)
      })
    }

    list = list.map((row) => {
      const rest = { ...row }
      delete rest.memo
      return rest
    })

    list.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      if (a.store !== b.store) return a.store.localeCompare(b.store)
      const an = (a as { leaveType?: string }).leaveType ? '휴가' : ''
      const bn = (b as { leaveType?: string }).leaveType ? '휴가' : ''
      if (an !== bn) return an < bn ? -1 : 1
      return (a.name || '').localeCompare(b.name || '')
    })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getWeeklySchedule:', e)
    return NextResponse.json([], { headers })
  }
}
