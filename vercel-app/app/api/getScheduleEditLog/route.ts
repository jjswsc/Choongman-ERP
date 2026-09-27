import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { attendanceStoreNamePostgrestVariantsFilter } from '@/lib/attendance-utils'
import { requireAuth } from '@/lib/verify-auth'
import { hasOfficeStaffScope } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

export const dynamic = 'force-dynamic'

function addDays(dateStr: string, days: number): string {
  const m = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return dateStr
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

function isAllStore(store: string): boolean {
  const s = store.trim().toLowerCase()
  return !s || s === 'all' || store === '전체' || store === '전체 매장'
}

function isMissingScheduleEditLogTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /schedule_edit_logs|42P01|PGRST205|does not exist/i.test(msg)
}

export type ScheduleEditLogRow = {
  id: number
  storeName: string
  scheduleDate: string
  employeeId: number
  employeeCode: string
  employeeName: string
  fieldName: string
  beforeValue: string
  afterValue: string
  actorName: string
  createdAt: string
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const monday = String(searchParams.get('monday') || '').trim().slice(0, 10)
  let store = String(searchParams.get('store') || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) {
    return NextResponse.json({ changes: [] }, { headers })
  }

  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .concat(userStore)
  const isWideAccess = hasOfficeStaffScope(userRole, userStore)
  if (!isWideAccess) {
    if (isAllStore(store)) {
      if (!userStore) return NextResponse.json({ changes: [] }, { status: 403, headers })
      store = userStore
    } else if (!allowedStores.some((s) => storesMatchForGradeLookup(s, store))) {
      return NextResponse.json({ changes: [] }, { status: 403, headers })
    }
  }

  const tenantScope = await resolveSaasTenantScope({ auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'schedule_edit_logs')) {
    return NextResponse.json({ changes: [] }, { headers })
  }

  const end = addDays(monday, 6)
  const parts = [`schedule_date=gte.${monday}`, `schedule_date=lte.${end}`]
  if (!isAllStore(store)) {
    const storeFilter = attendanceStoreNamePostgrestVariantsFilter(store)
    if (storeFilter) parts.push(storeFilter)
  }
  const baseFilter = parts.join('&')
  const filter = appendSaasTenantFilter(baseFilter, tenantScope, 'schedule_edit_logs')

  const mapRows = (rows: Record<string, unknown>[]): ScheduleEditLogRow[] =>
    rows.map((r) => ({
      id: Number(r.id) || 0,
      storeName: String(r.store_name || '').trim(),
      scheduleDate: String(r.schedule_date || '').slice(0, 10),
      employeeId: Number(r.employee_id) > 0 ? Math.floor(Number(r.employee_id)) : 0,
      employeeCode: String(r.employee_code || '').trim(),
      employeeName: String(r.employee_name || '').trim(),
      fieldName: String(r.field_name || '').trim(),
      beforeValue: String(r.before_value || ''),
      afterValue: String(r.after_value || ''),
      actorName: String(r.actor_name || '').trim(),
      createdAt: String(r.created_at || ''),
    }))

  try {
    const rows = (await supabaseSelectFilterAllPages('schedule_edit_logs', filter, {
      order: 'created_at.desc',
      pageSize: 1000,
      maxRows: 5000,
    })) as Record<string, unknown>[]
    return NextResponse.json({ changes: mapRows(rows) }, { headers })
  } catch (e) {
    if (isMissingScheduleEditLogTable(e)) {
      return NextResponse.json({ changes: [] }, { headers })
    }
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('schedule_edit_logs')
      try {
        const rows = (await supabaseSelectFilterAllPages('schedule_edit_logs', baseFilter, {
          order: 'created_at.desc',
          pageSize: 1000,
          maxRows: 5000,
        })) as Record<string, unknown>[]
        return NextResponse.json({ changes: mapRows(rows) }, { headers })
      } catch (e2) {
        if (isMissingScheduleEditLogTable(e2)) return NextResponse.json({ changes: [] }, { headers })
        console.warn('getScheduleEditLog:', e2)
        return NextResponse.json({ changes: [] }, { headers })
      }
    }
    console.warn('getScheduleEditLog:', e)
    return NextResponse.json({ changes: [] }, { headers })
  }
}
