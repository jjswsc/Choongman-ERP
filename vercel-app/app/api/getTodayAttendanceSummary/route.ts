import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  attendanceStoreNamePostgrestVariantsFilter,
  bangkokDateRangeToUtc,
  toDateStrBangkok,
  getBangkokHour,
  addDayBangkok,
} from '@/lib/attendance-utils'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  employeeCodeForJoinFromMaster,
  joinKeyFromAttendanceLog,
  resolveCanonicalEmployeeName,
  type EmpRowForRealtimeJoin,
} from '@/lib/today-realtime-join'
import { normalizeEmployeeCodeForMatch } from '@/lib/employee-display-name'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  isSaasTenantQueryBlocked,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

/** 실시간 격자: 출근 요약 name 은 풀네임인데 스케줄 표시는 nick 일 때 조인 보강 */
function nickFromEmployeeMaster(
  empList: EmpRowForRealtimeJoin[],
  employeeId: number,
  employeeCode: string
): string | undefined {
  let id = employeeId > 0 ? Math.floor(employeeId) : 0
  const codeNorm = normalizeEmployeeCodeForMatch(String(employeeCode ?? ''))
  if (id <= 0 && codeNorm) {
    const byCode = empList.find(
      (e) => normalizeEmployeeCodeForMatch(String(e.employee_code ?? '')) === codeNorm
    )
    if (byCode?.id != null) id = Math.floor(Number(byCode.id))
  }
  if (id > 0) {
    const emp = empList.find((e) => e.id != null && Math.floor(Number(e.id)) === id)
    const nk = String(emp?.nick ?? '').trim()
    if (nk) return nk
  }
  return undefined
}

const TZ = 'Asia/Bangkok'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'employees')) {
    return NextResponse.json([], { headers })
  }
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const dateStr = String(searchParams.get('date') || searchParams.get('dateStr') || '').trim().slice(0, 10)

  if (!dateStr || dateStr.length < 10) {
    return NextResponse.json([], { headers })
  }

  try {
    const isAll = !store || store.toLowerCase() === 'all' || store === '전체' || store === '전체 매장'
    let empList: EmpRowForRealtimeJoin[] = []
    const empSelectCandidates = [
      'id,name,nick,store,employee_code,extra_stores',
      'id,name,nick,store,extra_stores',
      'id,name,nick,store,employee_code',
      'name,nick,store,employee_code',
      'id,name,nick,store',
      'name,nick,store',
    ] as const
    for (const sel of empSelectCandidates) {
      try {
        empList = (await supabaseSelectFilter('employees', appendSaasTenantFilter('id=gt.0', tenantScope, 'employees'), { order: 'id.asc', limit: 5000, select: sel })) as EmpRowForRealtimeJoin[]
        break
      } catch {
        continue
      }
    }
    type AttRow = {
      log_at?: string
      store_name?: string
      name?: string
      employee_id?: number | null
      employee_code?: string | null
      log_type?: string
      late_min?: number
      early_min?: number
      ot_min?: number
      break_min?: number
      status?: string
      approved?: string
      id?: number
    }

    // dateStr ~ dateStr+1 조회 (자정 넘김 퇴근 포함: 익일 00~06시)
    const nextDayStr = addDayBangkok(dateStr, 1)
    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(dateStr, nextDayStr)
    const logFilter = `log_at=gte.${encodeURIComponent(startISO)}&log_at=lt.${encodeURIComponent(endISOExclusive)}`
    const storeFilter = isAll ? '' : `&${attendanceStoreNamePostgrestVariantsFilter(store)}`
    const logSelectWithIds =
      'log_at,store_name,name,employee_id,employee_code,log_type,late_min,early_min,ot_min,break_min,status,approved,id'
    const logSelectNoCode = 'log_at,store_name,name,employee_id,log_type,late_min,early_min,ot_min,break_min,status,approved,id'
    const logSelectLegacy = 'log_at,store_name,name,log_type,late_min,early_min,ot_min,break_min,status,approved,id'
    let rows: AttRow[] = []
    /** 직원·이벤트가 많은 매장에서 500건이면 당일 일부 출근 행이 잘려 실시간 격자만 미출근(빨강) 처리될 수 있음 */
    const LOG_DAY_LIMIT = 8000
    const fetchLogs = async (select: string) => {
      if (isAll) {
        return (await supabaseSelectFilter('attendance_logs', logFilter, {
          order: 'log_at.asc',
          limit: LOG_DAY_LIMIT,
          select,
        })) as AttRow[]
      }
      return (await supabaseSelectFilter('attendance_logs', `${logFilter}${storeFilter}`, {
        order: 'log_at.asc',
        limit: LOG_DAY_LIMIT,
        select,
      })) as AttRow[]
    }
    try {
      rows = await fetchLogs(logSelectWithIds)
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (/employee_code|employee_id|42703|column/i.test(em)) {
        try {
          rows = await fetchLogs(logSelectNoCode)
        } catch (e2) {
          const em2 = e2 instanceof Error ? e2.message : String(e2)
          if (/employee_id|42703|column/i.test(em2)) {
            rows = await fetchLogs(logSelectLegacy)
          } else {
            throw e2
          }
        }
      } else {
        throw e
      }
    }

    const byKey: Record<
      string,
      {
        store: string
        name: string
        joinKey: string
        employeeCode: string
        employeeId: number
        inTime: string | null
        outTime: string | null
        lateMin: number
        earlyMin: number
        otMin: number
        breakMin: number
        status: string
        approval: string
        onlyIn: boolean
        breakSeen: Set<string>
      }
    > = {}

    for (const r of rows || []) {
      const rowDate = toDateStrBangkok(r.log_at)
      const rowStore = String(r.store_name || '').trim()
      if (!isAll && !storesMatchForGradeLookup(rowStore, store)) continue
      const joinKey = joinKeyFromAttendanceLog(rowStore, r, empList || [])
      const rawLogName = String(r.name || '').trim()
      const name = resolveCanonicalEmployeeName(empList || [], rowStore, rawLogName)
      const idNum = r.employee_id != null && Number.isFinite(Number(r.employee_id)) ? Math.floor(Number(r.employee_id)) : 0
      const codeOut = employeeCodeForJoinFromMaster(empList || [], idNum, r.employee_code)
      const key = joinKey
      const type = String(r.log_type || '').trim()
      const logAt = r.log_at || ''

      // 익일 00~07시 퇴근만 자정 넘김으로 허용 (그 외 익일 로그는 무시)
      if (rowDate === nextDayStr) {
        if (type !== '퇴근' || getBangkokHour(logAt) > 7) continue
      } else if (rowDate !== dateStr) {
        continue
      }

      if (!byKey[key]) {
        byKey[key] = {
          store: rowStore,
          name,
          joinKey,
          employeeCode: codeOut,
          employeeId: 0,
          inTime: null,
          outTime: null,
          lateMin: 0,
          earlyMin: 0,
          otMin: 0,
          breakMin: 0,
          status: '',
          approval: '대기',
          onlyIn: false,
          breakSeen: new Set<string>(),
        }
      }
      const rec = byKey[key]
      if (idNum > 0 && !rec.employeeId) rec.employeeId = idNum

      if (type === '출근') {
        if (!rec.inTime || (logAt && (!rec.inTime || logAt < rec.inTime))) {
          rec.inTime = logAt
          rec.lateMin = Number(r.late_min) || 0
        }
      } else if (type === '퇴근') {
        if (!rec.outTime || (logAt && (!rec.outTime || logAt > rec.outTime))) {
          rec.outTime = logAt
          rec.earlyMin = Number(r.early_min) || 0
          rec.otMin = Number(r.ot_min) || 0
          rec.status = String(r.status || '').trim() || rec.status
          rec.approval = String(r.approved || '').trim() || '대기'
        }
      } else if (type === '휴식종료') {
        const breakLogKey = `${String(logAt).slice(0, 19)}|${Number(r.break_min) || 0}`
        if (!rec.breakSeen.has(breakLogKey)) {
          rec.breakSeen.add(breakLogKey)
          rec.breakMin += Number(r.break_min) || 0
        }
      }
    }

    const result = Object.values(byKey)
      .filter((r) => r.inTime != null)
      .map((r) => ({
        store: r.store,
        name: r.name,
        joinKey: r.joinKey,
        employeeCode: r.employeeCode || undefined,
        employeeId: r.employeeId || undefined,
        nick: nickFromEmployeeMaster(empList, r.employeeId || 0, r.employeeCode || ''),
        inTimeStr: r.inTime ? new Date(r.inTime).toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '',
        outTimeStr: r.outTime ? new Date(r.outTime).toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '미기록',
        lateMin: r.lateMin,
        status: r.outTime ? r.status : '퇴근미기록',
        onlyIn: !r.outTime,
      }))

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getTodayAttendanceSummary:', e)
    return NextResponse.json([], { headers })
  }
}
