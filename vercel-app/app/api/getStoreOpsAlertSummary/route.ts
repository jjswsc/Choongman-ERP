import { NextRequest, NextResponse } from 'next/server'
import { supabaseCountFilter, supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { fetchErpStoresMaster, buildStoreListFromEmployees } from '@/lib/erp-store-master'
import { filterPosSalesStoreOptionsForManagement } from '@/lib/pos-sales-test-office'
import { requireAuth } from '@/lib/verify-auth'
import { hasOfficeStaffScope } from '@/lib/permissions'
import {
  appendStoreOpsScopeFilter,
  storeOpsIsStoreCheckedToday,
  storeOpsOpenComplaintBadgePostgrestFilter,
  storeOpsStaleRepairBadgePostgrestFilter,
  storeOpsStoreInScope,
  storeOpsStoreNameScopePostgrestFilter,
} from '@/lib/store-ops-alert-utils'

/** 매장 운영 허브·사이드바 배지 — 아직 미착수(접수)·당일 미점검만 (권한 범위·COUNT) */
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
    const scopeFilter = officeScope ? '' : storeOpsStoreNameScopePostgrestFilter(allowedStores)

    const staleRepairBase = storeOpsStaleRepairBadgePostgrestFilter({ todayYmd: today })
    const openComplaintBase = storeOpsOpenComplaintBadgePostgrestFilter({ todayYmd: today })

    const [checkRows, staleRepairs, openComplaints, empList] = await Promise.all([
      supabaseSelectFilter('check_results', `check_date=eq.${today}`, {
        select: 'store_name',
        limit: 5000,
      }) as Promise<{ store_name?: string }[]>,
      supabaseCountFilter('store_repair_tickets', appendStoreOpsScopeFilter(staleRepairBase, scopeFilter)),
      supabaseCountFilter('complaint_logs', appendStoreOpsScopeFilter(openComplaintBase, scopeFilter)),
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
