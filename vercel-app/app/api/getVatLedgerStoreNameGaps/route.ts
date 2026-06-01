import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { analyzeVatLedgerStoreNameGaps } from '@/lib/vat-ledger-store-name-gaps'
import { getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole, isOfficeStore } from '@/lib/permissions'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  const { searchParams } = new URL(request.url)
  const userRole = String(authResult.auth.role || '').trim()
  const taxMonth = String(searchParams.get('taxMonth') || '').trim().slice(0, 7)
  const yearMonth = String(searchParams.get('yearMonth') || taxMonth).trim().slice(0, 7)
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'annual' || periodTypeRaw === 'half_year' ? periodTypeRaw : 'monthly'
  const requestedStoreFilter = String(searchParams.get('storeFilter') || '').trim()

  const allowedStores = (
    Array.isArray(authResult.auth.allowedStores) ? authResult.auth.allowedStores : []
  )
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .concat(String(authResult.auth.store || '').trim())

  const userStore = String(authResult.auth.store || '').trim()
  const isOfficeLevel =
    isOfficeRole(userRole) ||
    isAccountingRole(userRole) ||
    isOfficeStore(userStore) ||
    isHeadOfficeLikeStoreName(userStore)

  let storeFilter = requestedStoreFilter
  if (!isOfficeLevel) {
    if (!requestedStoreFilter || requestedStoreFilter === 'All') {
      storeFilter = String(allowedStores[0] || '').trim()
      if (!storeFilter) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, requestedStoreFilter))
      if (!allowed) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
  }

  try {
    assertCanManageAccountingCompliance(userRole, userStore)
  } catch {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
  }

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }

  try {
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
    const report = await analyzeVatLedgerStoreNameGaps({
      months: period.months,
      storeFilter: storeFilter || 'All',
      matchesStore: (name) => storeScope.matches(name),
    })
    return NextResponse.json({ period, report }, { headers })
  } catch (e) {
    console.error('getVatLedgerStoreNameGaps:', e)
    return NextResponse.json({ error: 'LOAD_FAILED' }, { status: 500, headers })
  }
}
