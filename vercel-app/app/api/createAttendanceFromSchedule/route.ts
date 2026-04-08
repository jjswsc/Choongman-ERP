import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert } from '@/lib/supabase-server'
import { normalizeEmployeeCodeForMatch } from '@/lib/employee-display-name'
import {
  attendanceStoreNamePostgrestFilter,
  employeeStorePostgrestFilter,
} from '@/lib/attendance-utils'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

/** submitAttendance 와 동일: employee_code / employee_id 컬럼 미배포 시 순차 제거 후 재시도 */
async function insertAttendanceLogRow(payload: Record<string, unknown>) {
  let toInsert: Record<string, unknown> = { ...payload }
  for (;;) {
    try {
      await supabaseInsert('attendance_logs', toInsert)
      return
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (/employee_code|42703|column/i.test(em) && 'employee_code' in toInsert) {
        const next = { ...toInsert }
        delete next.employee_code
        toInsert = next
        continue
      }
      if (/employee_id|42703|column/i.test(em) && 'employee_id' in toInsert) {
        const next = { ...toInsert }
        delete next.employee_id
        toInsert = next
        continue
      }
      throw e
    }
  }
}

function parsePlanToDate(dateStr: string, planVal: string): Date | null {
  if (!dateStr || !planVal || typeof planVal !== 'string') return null
  const s = planVal.trim()
  const m = s.match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mn = parseInt(m[2], 10)
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return null
  d.setHours(h, mn, 0, 0)
  return d
}

function calcBreakMin(breakStart: string, breakEnd: string): number {
  if (!breakStart || !breakEnd) return 0
  const m1 = breakStart.trim().match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  const m2 = breakEnd.trim().match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (!m1 || !m2) return 0
  const bs = parseInt(m1[1], 10) * 60 + parseInt(m1[2], 10)
  const be = parseInt(m2[1], 10) * 60 + parseInt(m2[2], 10)
  return Math.max(0, be - bs)
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers })
  }

  try {
    const body = await request.json()
    const dateStr = String(body?.date || body?.dateStr || '').trim().slice(0, 10)
    const storeName = String(body?.store || body?.storeName || '').trim()
    const empName = String(body?.name || body?.empName || '').trim()
    const employeeIdRaw = body?.employeeId
    let employeeId =
      employeeIdRaw != null && Number.isFinite(Number(employeeIdRaw)) ? Math.floor(Number(employeeIdRaw)) : 0
    const userStore = String(body?.userStore || '').trim()
    const userRole = String(body?.userRole || '').toLowerCase()

    if (!dateStr || dateStr.length < 10 || !storeName || !empName) {
      return NextResponse.json(
        { success: false, message: '날짜, 매장, 이름이 필요합니다.' },
        { headers }
      )
    }

    const isManager = userRole === 'manager'
    if (isManager && userStore && !storesMatchForGradeLookup(String(storeName).trim(), userStore)) {
      return NextResponse.json(
        { success: false, message: '해당 매장만 처리할 수 있습니다.' },
        { headers }
      )
    }

    // 스케줄 조회
    const schFilter =
      employeeId > 0
        ? `schedule_date=eq.${dateStr}&${attendanceStoreNamePostgrestFilter(storeName)}&employee_id=eq.${employeeId}`
        : `schedule_date=eq.${dateStr}&${attendanceStoreNamePostgrestFilter(storeName)}&name=ilike.${encodeURIComponent(empName)}`
    const schRows = (await supabaseSelectFilter('schedules', schFilter, { limit: 1 })) as {
      schedule_date?: string
      store_name?: string
      name?: string
      plan_in?: string
      plan_out?: string
      break_start?: string
      break_end?: string
      plan_in_prev_day?: boolean
    }[]

    if (!schRows || schRows.length === 0) {
      return NextResponse.json(
        { success: false, message: '해당 날짜의 스케줄을 찾을 수 없습니다.' },
        { headers }
      )
    }

    const sch = schRows[0]
    const planIn = String(sch.plan_in || '09:00').trim()
    const planOut = String(sch.plan_out || '18:00').trim()
    const planBS = String(sch.break_start || '').trim()
    const planBE = String(sch.break_end || '').trim()
    const planInPrevDay = !!sch.plan_in_prev_day

    // 직원코드 스냅샷·표준 이름 (submitAttendance 와 동일 규칙)
    let empCodeNorm = ''
    let logName = empName
    if (employeeId > 0) {
      const empRows = (await supabaseSelectFilter(
        'employees',
        `id=eq.${employeeId}&${employeeStorePostgrestFilter(storeName)}`,
        { limit: 1, select: 'name,employee_code' }
      )) as { name?: string; employee_code?: string | null }[]
      const er = empRows?.[0]
      if (er) {
        if (String(er.name || '').trim()) logName = String(er.name || '').trim()
        empCodeNorm = normalizeEmployeeCodeForMatch(String(er.employee_code ?? ''))
      }
    } else {
      const matched = (await supabaseSelectFilter(
        'employees',
        `${employeeStorePostgrestFilter(storeName)}&name=ilike.${encodeURIComponent(empName)}`,
        { limit: 5, select: 'id,name,employee_code' }
      )) as { id?: number; name?: string; employee_code?: string | null }[]
      if ((matched || []).length === 1) {
        const m = matched[0]
        const inferredId = m.id != null && Number.isFinite(Number(m.id)) ? Math.floor(Number(m.id)) : 0
        if (inferredId > 0) {
          employeeId = inferredId
          if (String(m.name || '').trim()) logName = String(m.name || '').trim()
          empCodeNorm = normalizeEmployeeCodeForMatch(String(m.employee_code ?? ''))
        }
      }
    }

    // 해당 날짜에 승인된 휴가가 있으면 긴급 인정 불가
    const leaveRows = (await (async () => {
      if (employeeId > 0) {
        try {
          return await supabaseSelectFilter(
            'leave_requests',
            `leave_date=eq.${dateStr}&${employeeStorePostgrestFilter(storeName)}&employee_id=eq.${employeeId}&status=eq.승인`,
            { limit: 5, select: 'id' }
          )
        } catch (e) {
          const em = e instanceof Error ? e.message : String(e)
          if (!/employee_id|42703|column/i.test(em)) throw e
        }
      }
      const leaveFilter = `leave_date=eq.${dateStr}&${employeeStorePostgrestFilter(storeName)}&name=ilike.${encodeURIComponent(empName)}&status=eq.승인`
      return await supabaseSelectFilter('leave_requests', leaveFilter, { limit: 5, select: 'id' })
    })()) as { id?: number }[]
    if (leaveRows && leaveRows.length > 0) {
      return NextResponse.json(
        { success: false, message: '해당 날짜는 휴가일입니다. 긴급 인정할 수 없습니다.' },
        { headers }
      )
    }

    // 이미 출근 기록 있는지 확인
    const nextD = new Date(dateStr + 'T12:00:00')
    nextD.setDate(nextD.getDate() + 1)
    const nextDayStr = nextD.toISOString().slice(0, 10)
    const attRows = (await (async () => {
      if (employeeId > 0) {
        try {
          const byId = (await supabaseSelectFilter(
            'attendance_logs',
            `${attendanceStoreNamePostgrestFilter(storeName)}&employee_id=eq.${employeeId}&log_at=gte.${dateStr}&log_at=lt.${nextDayStr}`,
            { limit: 10, select: 'log_type' }
          )) as { log_type?: string }[]
          const merged: { log_type?: string }[] = [...(byId || [])]
          if (empCodeNorm) {
            try {
              const byCode = (await supabaseSelectFilter(
                'attendance_logs',
                `${attendanceStoreNamePostgrestFilter(storeName)}&employee_code=eq.${encodeURIComponent(empCodeNorm)}&employee_id=is.null&log_at=gte.${dateStr}&log_at=lt.${nextDayStr}`,
                { limit: 10, select: 'log_type' }
              )) as { log_type?: string }[]
              merged.push(...(byCode || []))
            } catch (e) {
              const em = e instanceof Error ? e.message : String(e)
              if (!/employee_code|42703|column/i.test(em)) throw e
            }
          }
          return merged
        } catch (e) {
          const em = e instanceof Error ? e.message : String(e)
          if (!/employee_id|42703|column/i.test(em)) throw e
          return []
        }
      }
      const attFilter = `${attendanceStoreNamePostgrestFilter(storeName)}&name=ilike.${encodeURIComponent(logName)}&log_at=gte.${dateStr}&log_at=lt.${nextDayStr}`
      return await supabaseSelectFilter('attendance_logs', attFilter, {
        limit: 10,
        select: 'log_type',
      })
    })()) as { log_type?: string }[]
    const hasIn = (attRows || []).some((r) => String(r.log_type || '').trim() === '출근')
    if (hasIn) {
      return NextResponse.json(
        { success: false, message: '이미 출근 기록이 있습니다.' },
        { headers }
      )
    }

    const inDate = parsePlanToDate(dateStr, planIn)
    if (!inDate || isNaN(inDate.getTime())) {
      return NextResponse.json(
        { success: false, message: '출근 시간을 파싱할 수 없습니다.' },
        { headers }
      )
    }

    let outDateStr = dateStr
    if (planInPrevDay) {
      const d = new Date(dateStr + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      outDateStr = d.toISOString().slice(0, 10)
    }
    const outDate = parsePlanToDate(outDateStr, planOut)
    if (!outDate || isNaN(outDate.getTime())) {
      return NextResponse.json(
        { success: false, message: '퇴근 시간을 파싱할 수 없습니다.' },
        { headers }
      )
    }

    const breakMin = calcBreakMin(planBS, planBE)

    const inPayload: Record<string, unknown> = {
      log_at: inDate.toISOString(),
      store_name: storeName,
      name: logName,
      log_type: '출근',
      lat: '',
      lng: '',
      planned_time: planIn,
      late_min: 0,
      early_min: 0,
      ot_min: 0,
      break_min: 0,
      reason: '',
      status: '정상(승인)',
      approved: '승인완료',
    }
    if (employeeId > 0) inPayload.employee_id = employeeId
    if (empCodeNorm) inPayload.employee_code = empCodeNorm
    await insertAttendanceLogRow(inPayload)

    const outPayload: Record<string, unknown> = {
      log_at: outDate.toISOString(),
      store_name: storeName,
      name: logName,
      log_type: '퇴근',
      lat: '',
      lng: '',
      planned_time: planOut,
      late_min: 0,
      early_min: 0,
      ot_min: 0,
      break_min: breakMin,
      reason: '',
      status: '정상(승인)',
      approved: '승인완료',
    }
    if (employeeId > 0) outPayload.employee_id = employeeId
    if (empCodeNorm) outPayload.employee_code = empCodeNorm
    await insertAttendanceLogRow(outPayload)

    return NextResponse.json(
      { success: true, message: '긴급 인정이 완료되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('createAttendanceFromSchedule:', e)
    return NextResponse.json(
      {
        success: false,
        message: '처리 실패: ' + (e instanceof Error ? e.message : String(e)),
      },
      { headers }
    )
  }
}
