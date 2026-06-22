import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  ATTENDANCE_PENDING_BADGE_LOOKBACK_DAYS,
  attendanceLogNeedsManagerApproval,
  attendancePendingApprovalPostgrestFilter,
  attendanceStoreNamePostgrestFilter,
  bangkokDateRangeToUtc,
} from '@/lib/attendance-utils'
import { requireAuth } from '@/lib/verify-auth'
import { hasOfficeStaffScope } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

const TZ = 'Asia/Bangkok'

/** log_at(UTC ISO) → 방콕 기준 날짜 YYYY-MM-DD (필터용) */
function toDateStrBangkok(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** log_at(UTC ISO) → 방콕 기준 표시 "YYYY-MM-DD HH:mm:ss" */
function toDisplayStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = new Date(val)
  if (isNaN(d.getTime())) return ''
  const datePart = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const timePart = d.toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return `${datePart} ${timePart}`
}

function buildAttendancePendingListFilter(store: string, startStr: string, endStr: string): string {
  const storePrefix =
    store && store !== 'All' && store !== '전체' ? attendanceStoreNamePostgrestFilter(store) : ''

  if (startStr || endStr) {
    const startYmd = (startStr || endStr).slice(0, 10)
    const endYmd = (endStr || startStr).slice(0, 10)
    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startYmd, endYmd)
    const datePrefix = [
      `log_at=gte.${encodeURIComponent(startISO)}`,
      `log_at=lt.${encodeURIComponent(endISOExclusive)}`,
    ].join('&')
    const prefix = storePrefix ? `${storePrefix}&${datePrefix}` : datePrefix
    return attendancePendingApprovalPostgrestFilter(prefix)
  }

  return attendancePendingApprovalPostgrestFilter(storePrefix || undefined, {
    lookbackDays: ATTENDANCE_PENDING_BADGE_LOOKBACK_DAYS,
  })
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  let store = String(searchParams.get('store') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)
  if (store === 'null' || store === 'undefined') store = ''

  const isScopedRole =
    !hasOfficeStaffScope(userRole, userStore) &&
    (userRole.includes('manager') || userRole.includes('franchisee'))
  if (isScopedRole) {
    if (!store || store === 'All' || store === '전체') {
      const fallbackStore = String(allowedStores[0] || '').trim()
      if (!fallbackStore) {
        return NextResponse.json([], { status: 403, headers })
      }
      store = fallbackStore
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, store))
      if (!allowed) {
        return NextResponse.json([], { status: 403, headers })
      }
    }
  }

  try {
    type Row = {
      id: number
      log_at?: string
      store_name?: string
      name?: string
      employee_id?: number | null
      log_type?: string
      status?: string
      approved?: string
      late_min?: number
      ot_min?: number
      early_min?: number
    }
    let rows: Row[] = []

    const filter = buildAttendancePendingListFilter(store, startStr, endStr)
    rows = (await supabaseSelectFilter('attendance_logs', filter, {
      order: 'log_at.desc',
      limit: 500,
      select: 'id,log_at,store_name,name,employee_id,log_type,status,approved,late_min,ot_min,early_min',
    })) as Row[]

    const nickMap: Record<string, string> = {}
    const nickById: Record<number, string> = {}
    const empList = (await supabaseSelect('employees', { order: 'id.asc', limit: 500, select: 'id,store,name,nick' })) as {
      id?: number
      store?: string
      name?: string
      nick?: string
    }[] | null
    for (const e of empList || []) {
      const s = String(e.store || '').trim()
      const n = String(e.name || '').trim()
      if (s && n) nickMap[s + '|' + n] = String(e.nick || '').trim()
      const eid = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
      if (eid > 0) nickById[eid] = String(e.nick || '').trim()
    }

    const list: {
      id: number
      log_at: string
      store_name: string
      name: string
      employee_id?: number
      nick?: string
      log_type: string
      status?: string
      approved?: string
      late_min?: number
      ot_min?: number
    }[] = []

    for (const r of rows || []) {
      if (!attendanceLogNeedsManagerApproval(r)) continue
      const rowDate = toDateStrBangkok(r.log_at)
      if (startStr && rowDate < startStr) continue
      if (endStr && rowDate > endStr) continue

      const rowStore = String(r.store_name || '').trim()
      const rowName = String(r.name || '').trim()
      const eid = r.employee_id != null && Number.isFinite(Number(r.employee_id)) ? Math.floor(Number(r.employee_id)) : 0
      list.push({
        id: r.id,
        log_at: toDisplayStr(r.log_at),
        store_name: rowStore,
        name: rowName,
        ...(eid > 0 ? { employee_id: eid } : {}),
        nick: (eid > 0 ? nickById[eid] : '') || nickMap[rowStore + '|' + rowName] || '',
        log_type: String(r.log_type || '').trim(),
        status: r.status,
        approved: r.approved,
        late_min: r.late_min != null ? Number(r.late_min) : 0,
        ot_min: r.ot_min != null ? Number(r.ot_min) : 0,
      })
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getAttendancePendingList:', e)
    return NextResponse.json([], { headers })
  }
}
