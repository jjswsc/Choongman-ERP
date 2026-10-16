import { NextRequest, NextResponse } from 'next/server'
import { parseListPagination, slicePage, DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination-params'
import { requireAuth } from '@/lib/verify-auth'
import { resolvePettyCashEffectiveStore } from '@/lib/petty-cash-store-scope'
import {
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'
import {
  buildPettyCashLedgerWithBalances,
  fetchPettyCashOpeningBalances,
  fetchPettyCashRowsInPeriod,
} from '@/lib/petty-cash-ledger-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const tenantScope = await resolveSaasTenantScope({ auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'petty_cash_transactions')) {
    return NextResponse.json(
      { items: [], total: 0, page: 1, pageSize: DEFAULT_LIST_PAGE_SIZE },
      { headers }
    )
  }
  const { searchParams } = new URL(request.url)
  let startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim().slice(0, 10)
  let endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const scopeFilter = String(searchParams.get('scopeFilter') || searchParams.get('scope') || '').trim()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const departmentFilter = String(searchParams.get('departmentFilter') || searchParams.get('department') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)
  const { page, pageSize } = parseListPagination(searchParams, null, 25)

  if (storeFilter === 'undefined' || storeFilter === 'null' || storeFilter === 'All') storeFilter = ''

  const { effectiveStore, forbidden } = resolvePettyCashEffectiveStore({
    scopeFilter,
    storeFilter,
    departmentFilter,
    userStore,
    userRole,
    allowedStores,
  })
  if (forbidden) {
    return NextResponse.json(
      { items: [], total: 0, page: 1, pageSize: DEFAULT_LIST_PAGE_SIZE },
      { status: 403, headers }
    )
  }

  // 기간 없으면 방콕 오늘만 (전체 이력 2만 건 ASC 잘림으로 최근 건이 빠지던 경로 차단)
  const today = getBangkokTodayDateString()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) startStr = today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endStr)) endStr = today

  try {
    const [rows, openingByStore] = await Promise.all([
      fetchPettyCashRowsInPeriod({
        startStr,
        endStr,
        effectiveStore,
        departmentFilter,
        tenantScope,
      }),
      fetchPettyCashOpeningBalances({
        beforeDate: startStr,
        effectiveStore,
        departmentFilter,
        tenantScope,
      }),
    ])

    const list = buildPettyCashLedgerWithBalances(rows, openingByStore)
    // 최신순 (화면 표시용)
    list.sort((a, b) => b.trans_date.localeCompare(a.trans_date) || b.id - a.id)

    const total = list.length
    const items = slicePage(list, page, pageSize)
    return NextResponse.json({ items, total, page, pageSize }, { headers })
  } catch (e) {
    console.error('getPettyCashList:', e)
    if (tenantScope.enforce && isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('petty_cash_transactions')
    }
    return NextResponse.json(
      { items: [], total: 0, page: 1, pageSize: DEFAULT_LIST_PAGE_SIZE },
      { headers }
    )
  }
}
