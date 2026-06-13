import { NextRequest, NextResponse } from 'next/server'
import { supabaseCountFilter, supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokTodayDateString, getBangkokDateRangeUtc } from '@/lib/bangkok-time'
import { fetchErpStoresMaster, buildStoreListFromEmployees } from '@/lib/erp-store-master'
import { filterPosSalesStoreOptionsForManagement } from '@/lib/pos-sales-test-office'
import { requireAuth } from '@/lib/verify-auth'
import { hasOfficeStaffScope } from '@/lib/permissions'
import {
  storeOpsIsStoreCheckedToday,
  storeOpsStoreInScope,
  storeOpsStoreNameScopePostgrestFilter,
} from '@/lib/store-ops-alert-utils'

function subtractDaysBangkok(endYmd: string, days: number): string {
  const { dayStartUtcIso } = getBangkokDateRangeUtc(endYmd, endYmd)
  const t = new Date(dayStartUtcIso).getTime() - days * 86400000
  return new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

function appendScopeFilter(baseFilter: string, scopeFilter: string): string {
  const scope = String(scopeFilter || '').trim()
  if (!scope) return baseFilter
  return `${baseFilter}&${scope}`
}

/** 매장 운영 허브·사이드바 배지 — 당일 미점검·장기 접수 수리·미처리 컴플레인 (권한 범위·COUNT) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const officeScope = hasOfficeStaffScope(userRole, userStore)
  const allowedStores = [
    ...new Set(
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)
    ),
  ]

  try {
    const today = getBangkokTodayDateString()
    const staleCutoff = subtractDaysBangkok(today, 3)
    const complaintStart = subtractDaysBangkok(today, 90)
    const scopeFilter = officeScope ? '' : storeOpsStoreNameScopePostgrestFilter(allowedStores)

    const staleRepairBase = `status=eq.${encodeURIComponent('접수')}&reported_at=lt.${encodeURIComponent(getBangkokDateRangeUtc(staleCutoff, staleCutoff).nextDayStartUtcIso)}`
    const openComplaintBase = `log_date=gte.${complaintStart}&status=in.(${encodeURIComponent('접수')},${encodeURIComponent('조사중')})`

    const [checkRows, staleRepairs, openComplaints, empList] = await Promise.all([
      supabaseSelectFilter('check_results', `check_date=eq.${today}`, {
        select: 'store_name',
        limit: 5000,
      }) as Promise<{ store_name?: string }[]>,
      supabaseCountFilter('store_repair_tickets', appendScopeFilter(staleRepairBase, scopeFilter)),
      supabaseCountFilter('complaint_logs', appendScopeFilter(openComplaintBase, scopeFilter)),
      supabaseSelect('employees', {
        order: 'id.asc',
        select: 'store,name,nick,job,role,resign_date,employment_status',
        limit: 5000,
      }) as Promise<
        {
          store?: string
          name?: string
          nick?: string
          job?: string
          role?: string
          resign_date?: string | null
          employment_status?: string | null
        }[]
      >,
    ])

    const masters = await fetchErpStoresMaster()
    const built = buildStoreListFromEmployees(empList, masters)
    let operationalStores = filterPosSalesStoreOptionsForManagement(built.stores).filter(
      (s) => s && s !== 'All' && !/^cm office$/i.test(s)
    )
    if (!officeScope) {
      operationalStores = operationalStores.filter((s) => storeOpsStoreInScope(s, allowedStores, false))
    }

    const checkedStoreNames = new Set(
      (checkRows || []).map((r) => String(r.store_name || '').trim()).filter(Boolean)
    )
    const uncheckedToday = operationalStores.filter(
      (s) => !storeOpsIsStoreCheckedToday(s, checkedStoreNames)
    ).length
    const checkedToday = Math.max(0, operationalStores.length - uncheckedToday)

    return NextResponse.json(
      {
        today,
        totalStores: operationalStores.length,
        checkedToday,
        uncheckedToday,
        staleRepairs,
        openComplaints,
      },
      { headers }
    )
  } catch (e) {
    console.error('getStoreOpsAlertSummary:', e)
    return NextResponse.json(
      {
        today: getBangkokTodayDateString(),
        totalStores: 0,
        checkedToday: 0,
        uncheckedToday: 0,
        staleRepairs: 0,
        openComplaints: 0,
      },
      { status: 500, headers }
    )
  }
}
