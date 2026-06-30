import { NextRequest, NextResponse } from 'next/server'
import { fetchMergedAttendanceLogsForEmployee } from '@/lib/attendance-log-fetch-server'
import { normalizeEmployeeCodeForMatch } from '@/lib/employee-display-name'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'

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
  const startDate = String(searchParams.get('startDate') || searchParams.get('start') || '').trim()
  const endDate = String(searchParams.get('endDate') || searchParams.get('end') || '').trim()
  const userRole = String(auth.role || '').trim()
  const isScopedRole = !isOfficeRole(userRole) && !isAccountingRole(userRole)
  const queryStoreFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const queryEmployeeFilter = String(searchParams.get('employeeFilter') || searchParams.get('name') || '').trim()
  const queryEmployeeIdRaw = String(searchParams.get('employeeId') || '').trim()
  const storeFilter = String(isScopedRole ? auth.store : queryStoreFilter || auth.store || '').trim()
  const employeeFilter = String(isScopedRole ? auth.name : queryEmployeeFilter || auth.name || '').trim()
  const employeeIdRaw = String(
    isScopedRole ? auth.employeeId || queryEmployeeIdRaw : queryEmployeeIdRaw || auth.employeeId || ''
  ).trim()
  const employeeId =
    employeeIdRaw && Number.isFinite(Number(employeeIdRaw)) ? Math.floor(Number(employeeIdRaw)) : 0
  const employeeCodeRaw = isScopedRole
    ? String(auth.employeeCode || searchParams.get('employeeCode') || searchParams.get('code') || '').trim()
    : String(searchParams.get('employeeCode') || searchParams.get('code') || auth.employeeCode || '').trim()
  const employeeCodeNorm = normalizeEmployeeCodeForMatch(employeeCodeRaw)

  if (!startDate || !endDate || !storeFilter || !employeeFilter) {
    return NextResponse.json([], { headers })
  }

  try {
    const rows = await fetchMergedAttendanceLogsForEmployee({
      storeFilter,
      employeeName: employeeFilter,
      ...(employeeId > 0 ? { employeeId } : {}),
      ...(employeeCodeNorm ? { employeeCode: employeeCodeRaw } : {}),
      startDate,
      endDate,
      order: 'log_at.asc',
      limit: 500,
      select: 'id,log_at,log_type,status,late_min,ot_min,approved,employee_id,employee_code,name',
    })

    const list: { timestamp: string; type: string; status: string; late_min?: number; ot_min?: number; approved?: string }[] = []
    for (const r of rows || []) {
      list.push({
        timestamp: r.log_at || '',
        type: String(r.log_type || '').trim(),
        status: String((r as { status?: string }).status || '').trim(),
        late_min: (r as { late_min?: number }).late_min != null ? Number((r as { late_min?: number }).late_min) : undefined,
        ot_min: (r as { ot_min?: number }).ot_min != null ? Number((r as { ot_min?: number }).ot_min) : undefined,
        approved: String((r as { approved?: string | null }).approved ?? '').trim() || undefined,
      })
    }
    list.sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAttendanceList:', e)
    return NextResponse.json([], { headers })
  }
}
