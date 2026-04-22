import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { normalizeEmployeeCodeForMatch } from '@/lib/employee-display-name'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'

const TZ = 'Asia/Bangkok'
const DEFAULT_ATTENDANCE_STATE = {
  types: [] as string[],
  canBreakStart: false,
  canBreakEnd: false,
  isOnBreak: false,
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const userRole = String(auth.role || '').trim()
  const isScopedRole = !isOfficeRole(userRole) && !isAccountingRole(userRole)
  const queryStoreName = String(searchParams.get('storeName') || searchParams.get('store') || '').trim()
  const queryName = String(searchParams.get('name') || '').trim()
  const queryEmployeeIdRaw = String(searchParams.get('employeeId') || '').trim()
  const storeName = String(isScopedRole ? auth.store : queryStoreName || auth.store || '').trim()
  const name = String(isScopedRole ? auth.name : queryName || auth.name || '').trim()
  const employeeIdRaw = String(
    isScopedRole ? auth.employeeId || '' : queryEmployeeIdRaw || auth.employeeId || ''
  ).trim()
  const employeeId =
    employeeIdRaw && Number.isFinite(Number(employeeIdRaw)) ? Math.floor(Number(employeeIdRaw)) : 0
  const employeeCodeNorm = normalizeEmployeeCodeForMatch(
    String(searchParams.get('employeeCode') || searchParams.get('code') || '').trim()
  )

  if (!storeName || !name) {
    return NextResponse.json(DEFAULT_ATTENDANCE_STATE, { headers })
  }

  try {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    // store_name: contains 패턴 사용 (예: "Union Mall" → "CM Union Mall" 매칭)
    const storePattern = '*' + String(storeName).replace(/\*/g, '') + '*'
    const rows = (await (async () => {
      const byIdFilter =
        employeeId > 0
          ? `store_name=ilike.${encodeURIComponent(storePattern)}&employee_id=eq.${employeeId}`
          : ''
      if (byIdFilter) {
        try {
          const selWithCode = 'log_at,log_type,employee_id,employee_code'
          const selNoCode = 'log_at,log_type,employee_id'
          let byIdRows: { log_at?: string; log_type?: string; employee_id?: number | null }[]
          try {
            byIdRows = (await supabaseSelectFilter('attendance_logs', byIdFilter, {
              order: 'log_at.desc',
              limit: 50,
              select: selWithCode,
            })) as { log_at?: string; log_type?: string; employee_id?: number | null }[]
          } catch (e) {
            const em = e instanceof Error ? e.message : String(e)
            if (!/employee_code|42703|column/i.test(em)) throw e
            byIdRows = (await supabaseSelectFilter('attendance_logs', byIdFilter, {
              order: 'log_at.desc',
              limit: 50,
              select: selNoCode,
            })) as { log_at?: string; log_type?: string; employee_id?: number | null }[]
          }
          const byNameRows = (await supabaseSelectFilter(
            'attendance_logs',
            `store_name=ilike.${encodeURIComponent(storePattern)}&name=ilike.${encodeURIComponent(name)}`,
            { order: 'log_at.desc', limit: 50, select: selNoCode }
          )) as { log_at?: string; log_type?: string; employee_id?: number | null }[]
          let byCodeRows: typeof byIdRows = []
          if (employeeCodeNorm.length > 0) {
            const codeF = `store_name=ilike.${encodeURIComponent(storePattern)}&employee_code=eq.${encodeURIComponent(employeeCodeNorm)}&employee_id=is.null`
            try {
              byCodeRows = (await supabaseSelectFilter('attendance_logs', codeF, {
                order: 'log_at.desc',
                limit: 50,
                select: selWithCode,
              })) as { log_at?: string; log_type?: string; employee_id?: number | null }[]
            } catch (e) {
              const em = e instanceof Error ? e.message : String(e)
              if (!/employee_code|42703|column/i.test(em)) throw e
            }
          }
          const merged = new Map<string, { log_at?: string; log_type?: string; employee_id?: number | null }>()
          const pushRow = (r: { log_at?: string; log_type?: string; employee_id?: number | null }) => {
            const rowEmpId =
              r.employee_id != null && Number.isFinite(Number(r.employee_id))
                ? Math.floor(Number(r.employee_id))
                : 0
            if (rowEmpId > 0 && rowEmpId !== employeeId) return
            const k = `${String(r.log_at || '')}|${String(r.log_type || '').trim()}`
            if (!merged.has(k)) merged.set(k, r)
          }
          for (const r of byIdRows || []) pushRow(r)
          for (const r of byNameRows || []) pushRow(r)
          for (const r of byCodeRows || []) pushRow(r)
          return Array.from(merged.values()).sort((a, b) => String(b.log_at || '').localeCompare(String(a.log_at || '')))
        } catch (e) {
          const em = e instanceof Error ? e.message : String(e)
          if (!/employee_id|42703|column/i.test(em)) throw e
        }
      }
      return await supabaseSelectFilter(
        'attendance_logs',
        `store_name=ilike.${encodeURIComponent(storePattern)}&name=ilike.${encodeURIComponent(name)}`,
        { order: 'log_at.desc', limit: 50, select: 'log_at,log_type' }
      )
    })()) as { log_at?: string; log_type?: string; employee_id?: number | null }[]

    const arr = rows || []

    // 자정 넘어도 미종료 세션(출근 후 퇴근 없음)이 있으면 퇴근 버튼 활성화
    // 가장 최근 퇴근 위치를 찾고, 그 이후에 출근이 있으면 오픈 세션
    let idxOfLastClockOut = -1
    for (let i = 0; i < arr.length; i++) {
      if (String(arr[i].log_type || '').trim() === '퇴근') {
        idxOfLastClockOut = i
        break
      }
    }

    const types: string[] = []

    if (idxOfLastClockOut >= 0) {
      // 퇴근 있음: 퇴근 이후에 출근이 있으면 새 세션(오픈)
      let hasNewSessionAfterClockOut = false
      for (let i = 0; i < idxOfLastClockOut; i++) {
        if (String(arr[i].log_type || '').trim() === '출근') {
          hasNewSessionAfterClockOut = true
          break
        }
      }
      if (!hasNewSessionAfterClockOut) {
        // 마지막 퇴근이 최신 → 당일만 사용 (기존 로직)
        for (const r of arr) {
          const rowDate = r.log_at ? new Date(r.log_at).toLocaleDateString('en-CA', { timeZone: TZ }) : ''
          if (rowDate !== todayStr) continue
          const typ = String(r.log_type || '').trim()
          if (typ && !types.includes(typ)) types.push(typ)
        }
        const hasClockIn = types.includes('출근')
        const hasClockOut = types.includes('퇴근')
        const canBreakStart = hasClockIn && !hasClockOut
        return NextResponse.json(
          {
            types,
            canBreakStart,
            canBreakEnd: false,
            isOnBreak: false,
          },
          { headers }
        )
      }
    }

    // 오픈 세션: 출근 후 퇴근이 없는 상태 (자정 넘어도 포함)
    // 전날 출근 후 퇴근 누락이면: 출근도 types에 넣어 퇴근 버튼 활성화 (hasClockIn=true)
    for (let i = 0; i < arr.length; i++) {
      const typ = String(arr[i].log_type || '').trim()
      if (typ === '출근') {
        // 오픈 세션이면 당일/전날 출근 모두 인정 → 퇴근 버튼 활성화
        if (!types.includes(typ)) types.push(typ)
        break
      }
      if (typ && !types.includes(typ)) types.push(typ)
    }

    const hasClockIn = types.includes('출근')
    const hasClockOut = types.includes('퇴근')
    let isOnBreak = false
    const latestBoundaryIdx = arr.findIndex((r) => {
      const typ = String(r.log_type || '').trim()
      return typ === '출근' || typ === '퇴근'
    })
    const latestBoundaryType =
      latestBoundaryIdx >= 0 ? String(arr[latestBoundaryIdx]?.log_type || '').trim() : ''
    if (latestBoundaryType === '출근') {
      for (let i = 0; i < latestBoundaryIdx; i++) {
        const typ = String(arr[i].log_type || '').trim()
        if (typ === '휴식시작') {
          isOnBreak = true
          break
        }
        if (typ === '휴식종료') {
          isOnBreak = false
          break
        }
      }
    }
    const canBreakStart = hasClockIn && !hasClockOut && !isOnBreak
    const canBreakEnd = hasClockIn && !hasClockOut && isOnBreak
    return NextResponse.json(
      {
        types,
        canBreakStart,
        canBreakEnd,
        isOnBreak,
      },
      { headers }
    )
  } catch (e) {
    console.error('getTodayAttendanceTypes:', e)
    return NextResponse.json(DEFAULT_ATTENDANCE_STATE, { headers })
  }
}
