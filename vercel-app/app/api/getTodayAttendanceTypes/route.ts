import { NextRequest, NextResponse } from 'next/server'
import {
  getOpenBreakStartMs,
  hasUnclosedClockWorkSession,
  todayStrBangkok,
} from '@/lib/attendance-utils'
import { fetchMergedAttendanceLogsForEmployee } from '@/lib/attendance-log-fetch-server'
import { resolveAttendanceEmployeeIdentity } from '@/lib/attendance-employee-resolve-server'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'

const TZ = 'Asia/Bangkok'
const DEFAULT_ATTENDANCE_STATE = {
  types: [] as string[],
  canBreakStart: false,
  canBreakEnd: false,
  isOnBreak: false,
  hasClockIn: false,
  hasClockOut: false,
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
  const storeName = String(
    isScopedRole ? queryStoreName || auth.store : queryStoreName || auth.store || ''
  ).trim()
  const name = String(queryName || auth.name || '').trim()
  const employeeIdRaw = String(
    isScopedRole
      ? queryEmployeeIdRaw || auth.employeeId || ''
      : queryEmployeeIdRaw || auth.employeeId || ''
  ).trim()
  const employeeId =
    employeeIdRaw && Number.isFinite(Number(employeeIdRaw)) ? Math.floor(Number(employeeIdRaw)) : 0
  const employeeCodeRaw = String(
    searchParams.get('employeeCode') ||
      searchParams.get('code') ||
      auth.employeeCode ||
      ''
  ).trim()

  if (!storeName || !name) {
    return NextResponse.json(DEFAULT_ATTENDANCE_STATE, { headers })
  }

  try {
    const resolved = await resolveAttendanceEmployeeIdentity({
      storeName,
      name,
      ...(employeeId > 0 ? { employeeId } : {}),
      ...(employeeCodeRaw ? { employeeCode: employeeCodeRaw } : {}),
    })
    const todayStr = todayStrBangkok()
    const logs = await fetchMergedAttendanceLogsForEmployee({
      storeFilter: storeName,
      employeeName: resolved.employeeName || name,
      ...(resolved.employeeId > 0 ? { employeeId: resolved.employeeId } : {}),
      ...(resolved.employeeCodeNorm ? { employeeCode: resolved.employeeCode } : {}),
      order: 'log_at.desc',
      limit: 100,
      select: 'id,log_at,log_type,employee_id,employee_code,name',
    })

    const openSession = hasUnclosedClockWorkSession(logs)
    const isOnBreak = getOpenBreakStartMs(logs) != null

    const types: string[] = []
    for (const r of logs) {
      const rowDate = r.log_at ? new Date(r.log_at).toLocaleDateString('en-CA', { timeZone: TZ }) : ''
      if (rowDate !== todayStr) continue
      const typ = String(r.log_type || '').trim()
      if (typ && !types.includes(typ)) types.push(typ)
    }
    if (openSession && !types.includes('출근')) types.push('출근')

    // 퇴근으로 세션이 닫혔으면 다시 출근 가능 (2교대/더블 시프트 허용)
    const hasClockIn = openSession
    const hasClockOut = !openSession && types.includes('퇴근')
    const canBreakStart = hasClockIn && !hasClockOut && !isOnBreak
    const canBreakEnd = hasClockIn && !hasClockOut && isOnBreak
    const typesForClient = openSession ? types.filter((t) => t !== '퇴근') : types

    return NextResponse.json(
      {
        types: typesForClient,
        canBreakStart,
        canBreakEnd,
        isOnBreak,
        hasClockIn,
        hasClockOut,
      },
      { headers }
    )
  } catch (e) {
    console.error('getTodayAttendanceTypes:', e)
    return NextResponse.json(DEFAULT_ATTENDANCE_STATE, { headers })
  }
}
