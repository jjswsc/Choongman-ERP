import { NextRequest, NextResponse } from 'next/server'
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
import { getBangkokMonthRange } from '@/lib/bangkok-time'

/** 해당 월(또는 기간) 거래 + 실시간 잔액 — DB 날짜 필터로 20000 ASC 잘림 방지 */
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
    return NextResponse.json([], { headers })
  }
  const { searchParams } = new URL(request.url)
  const scopeFilter = String(searchParams.get('scopeFilter') || searchParams.get('scope') || '').trim()
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const departmentFilter = String(searchParams.get('departmentFilter') || searchParams.get('department') || '').trim()
  let yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const startParam = String(searchParams.get('startStr') || searchParams.get('startDate') || '').trim()
  const endParam = String(searchParams.get('endStr') || searchParams.get('endDate') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)

  if (storeFilter === 'undefined' || storeFilter === 'null' || storeFilter === 'All') storeFilter = ''

  const { effectiveStore, forbidden } = resolvePettyCashEffectiveStore({
    scopeFilter,
    storeFilter,
    departmentFilter,
    userStore,
    userRole,
    allowedStores,
  })
  if (forbidden) return NextResponse.json([], { status: 403, headers })

  let startStr: string
  let endStr: string
  if (startParam.length >= 10 && endParam.length >= 10) {
    startStr = startParam.slice(0, 10)
    endStr = endParam.slice(0, 10)
  } else {
    if (yearMonth.length < 7) {
      yearMonth = getBangkokMonthRange().yearMonth
    }
    const range = getBangkokMonthRange(yearMonth.slice(0, 7))
    startStr = range.startStr
    endStr = range.endStr
  }

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
    // 월별 화면: 매장·날짜 ASC (기존과 동일)
    list.sort((a, b) => {
      const c = a.store.localeCompare(b.store)
      return c !== 0 ? c : a.trans_date.localeCompare(b.trans_date) || a.id - b.id
    })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPettyCashMonthDetail:', e)
    if (tenantScope.enforce && isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('petty_cash_transactions')
    }
    return NextResponse.json([], { headers })
  }
}
