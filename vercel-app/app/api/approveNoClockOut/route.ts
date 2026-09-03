import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import { normalizeEmployeeNameForGradeMatch } from '@/lib/employee-display-name'
import { requireAuth } from '@/lib/verify-auth'
import { hasOfficeStaffScope } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

function normalizeNameForSchedule(name: string): string {
  return normalizeEmployeeNameForGradeMatch(name)
}

function parsePlanToMinutes(plan: string | null | undefined): number {
  if (!plan || typeof plan !== 'string') return 0
  const m = plan.trim().match(/(\d{1,2})\s*[:\s]\s*(\d{1,2})/)
  if (!m) return 0
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/** 계획 근무시간(시간). plan_in~plan_out - 휴게 */
function plannedHrsFromPlans(planIn: string, planOut: string, planBS: string, planBE: string, planInPrevDay?: boolean): number {
  const inMin = parsePlanToMinutes(planIn)
  let outMin = parsePlanToMinutes(planOut)
  if (planInPrevDay && outMin < inMin) outMin += 24 * 60
  const bsMin = parsePlanToMinutes(planBS)
  const beMin = parsePlanToMinutes(planBE)
  if (inMin >= outMin) return 0
  let workMin = outMin - inMin
  if (bsMin && beMin && beMin > bsMin) workMin -= beMin - bsMin
  return Math.max(0, workMin) / 60
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

/**
 * 퇴근 미기록 건에 대해 강제퇴근 인정(퇴근 로그 1건 생성).
 * 해당 날짜에 출근은 있으나 퇴근이 없을 때만 호출.
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers })
  }

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      authResult.errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json()
    const dateStr = String(body?.date || body?.dateStr || '').trim().slice(0, 10)
    const storeName = String(body?.store || body?.storeName || '').trim()
    const empName = String(body?.name || body?.empName || '').trim()
    const employeeIdRaw = body?.employeeId
    const employeeId =
      employeeIdRaw != null && Number.isFinite(Number(employeeIdRaw)) ? Math.floor(Number(employeeIdRaw)) : 0
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)
    const optEarlyRaw = body?.optEarlyMinutes ?? body?.earlyMinutes
    let optEarlyMinutes = 0
    if (optEarlyRaw != null && optEarlyRaw !== '') {
      const n = Number(optEarlyRaw)
      if (Number.isFinite(n) && n >= 0) optEarlyMinutes = Math.min(24 * 60, Math.floor(n))
    }

    if (!dateStr || dateStr.length < 10 || !storeName || !empName) {
      return NextResponse.json(
        { success: false, message: '날짜, 매장, 이름이 필요합니다.' },
        { headers }
      )
    }

    const isScopedRole =
      !hasOfficeStaffScope(userRole, userStore) &&
      (userRole.includes('manager') || userRole.includes('franchisee'))
    if (isScopedRole) {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeName))
      if (!allowed) {
        return NextResponse.json(
          { success: false, message: '해당 매장만 처리할 수 있습니다.' },
          { headers }
        )
      }
    }
    const nextD = new Date(dateStr + 'T12:00:00')
    nextD.setDate(nextD.getDate() + 1)
    const nextDayStr = nextD.toISOString().slice(0, 10)
    const attRows = (await (async () => {
      if (employeeId > 0) {
        try {
          return await supabaseSelectFilter(
            'attendance_logs',
            `store_name=ilike.${encodeURIComponent(storeName)}&employee_id=eq.${employeeId}&log_at=gte.${dateStr}&log_at=lt.${nextDayStr}`,
            { order: 'log_at.asc', limit: 200, select: 'id,log_type,log_at,status' }
          )
        } catch (e) {
          const em = e instanceof Error ? e.message : String(e)
          if (!/employee_id|42703|column/i.test(em)) throw e
        }
      }
      const attFilter = `store_name=ilike.${encodeURIComponent(storeName)}&name=ilike.${encodeURIComponent(empName)}&log_at=gte.${dateStr}&log_at=lt.${nextDayStr}`
      return await supabaseSelectFilter('attendance_logs', attFilter, {
        order: 'log_at.asc',
        limit: 200,
        select: 'id,log_type,log_at,status',
      })
    })()) as { id?: number; log_type?: string; log_at?: string; status?: string }[]
    const inLogs = (attRows || []).filter((r) => String(r.log_type || '').trim() === '출근')
    const outLogs = (attRows || []).filter((r) => String(r.log_type || '').trim() === '퇴근')

    if (inLogs.length === 0) {
      return NextResponse.json(
        { success: false, message: '해당 날짜에 출근 기록이 없습니다.' },
        { headers }
      )
    }

    // 더블 시프트: 마지막(가장 늦은) 출근 기준으로 퇴근 누락 여부 판단
    // attRows는 log_at.asc 정렬이므로 마지막 출근 = inLogs[last]
    const lastIn = inLogs[inLogs.length - 1]
    const inTimeIso = lastIn.log_at || ''
    if (!inTimeIso) {
      return NextResponse.json(
        { success: false, message: '출근 시각을 확인할 수 없습니다.' },
        { headers }
      )
    }
    const lastInMs = new Date(inTimeIso).getTime()
    // 마지막 출근 이후의 퇴근이 있으면 이미 처리된 것
    const hasOutAfterLastIn = outLogs.some((r) => {
      const t = r.log_at ? new Date(r.log_at).getTime() : 0
      return t > lastInMs && !/강제퇴근\(승인\)/.test(String(r.status || ''))
    })
    if (hasOutAfterLastIn) {
      return NextResponse.json(
        { success: false, message: '이미 퇴근 기록이 있습니다.' },
        { headers }
      )
    }

    // 스케줄: 같은 날·매장에서 이름 일치 또는 부분 일치(근태 풀네임 vs 스케줄 닉네임)
    const schFilter = `schedule_date=eq.${dateStr}&store_name=ilike.${encodeURIComponent(storeName)}`
    const schRowsAll = (await supabaseSelectFilter('schedules', schFilter, { limit: 500 })) as {
      name?: string
      employee_id?: number | null
      plan_in?: string
      plan_out?: string
      break_start?: string
      break_end?: string
      plan_in_prev_day?: boolean
    }[]
    const empNorm = normalizeNameForSchedule(empName)
    const schRow = (schRowsAll || []).find((s) => {
      const sid = s.employee_id != null && Number.isFinite(Number(s.employee_id)) ? Math.floor(Number(s.employee_id)) : 0
      if (employeeId > 0 && sid > 0) return sid === employeeId
      const sn = String(s?.name || '').trim()
      const snNorm = normalizeNameForSchedule(sn)
      return !sn ? false : sn === empName || empNorm === snNorm || empNorm.includes(snNorm) || snNorm.includes(empNorm)
    })
    const schRows = schRow ? [schRow] : []

    const planIn = (schRows?.[0]?.plan_in || '09:00').trim()
    const planOut = (schRows?.[0]?.plan_out || '18:00').trim()
    const planBS = String(schRows?.[0]?.break_start || '').trim()
    const planBE = String(schRows?.[0]?.break_end || '').trim()
    const planInPrevDay = !!schRows?.[0]?.plan_in_prev_day

    const plannedWorkHrs = plannedHrsFromPlans(planIn, planOut, planBS, planBE, planInPrevDay)
    const plannedWorkMin = Math.round(plannedWorkHrs * 60)
    const breakMin = calcBreakMin(planBS, planBE)

    // 퇴근 시각 = 출근 시각 + 계획 근무시간 + 휴게 → 실제 근무가 계획과 일치
    const inMs = new Date(inTimeIso).getTime()
    const originalOutMs = inMs + (plannedWorkMin + breakMin) * 60 * 1000
    /** 조퇴(분): 계획 퇴근 시각보다 일찍 나간 만큼 — 관리자 입력 시 퇴근 시각을 앞당김 */
    const maxEarlyMin = Math.max(0, Math.floor((originalOutMs - inMs) / (60 * 1000)) - 1)
    const effectiveEarlyMin = Math.min(optEarlyMinutes, maxEarlyMin)
    const outMs = originalOutMs - effectiveEarlyMin * 60 * 1000
    const outDate = new Date(outMs)

    // 기존 강제퇴근(승인) 기록이 있으면 업데이트
    const existingForceOut = outLogs.find((r) =>
      r.log_at && new Date(r.log_at).getTime() > lastInMs && /강제퇴근\(승인\)/.test(String(r.status || ''))
    )
    if (existingForceOut?.id != null) {
      await supabaseUpdate('attendance_logs', existingForceOut.id, {
        log_at: outDate.toISOString(),
        break_min: breakMin,
        late_min: 0,
        early_min: effectiveEarlyMin,
        ot_min: 0,
      })
    } else {
      const payload: Record<string, unknown> = {
        log_at: outDate.toISOString(),
        store_name: storeName,
        name: empName,
        log_type: '퇴근',
        lat: '',
        lng: '',
        planned_time: planOut,
        late_min: 0,
        early_min: effectiveEarlyMin,
        ot_min: 0,
        break_min: breakMin,
        reason: '',
        status: '강제퇴근(승인)',
        approved: '승인완료',
      }
      if (employeeId > 0) payload.employee_id = employeeId
      try {
        await supabaseInsert('attendance_logs', payload)
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (/employee_id|42703|column/i.test(em) && 'employee_id' in payload) {
          const { employee_id: _eid, ...fallback } = payload
          await supabaseInsert('attendance_logs', fallback)
        } else {
          throw e
        }
      }
    }

    return NextResponse.json(
      { success: true, message: '퇴근 미기록 인정이 완료되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('approveNoClockOut:', e)
    return NextResponse.json(
      {
        success: false,
        message: '처리 실패: ' + (e instanceof Error ? e.message : String(e)),
      },
      { headers }
    )
  }
}
