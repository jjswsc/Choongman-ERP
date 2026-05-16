import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { getAccountingPeriodCloseSnapshot } from '@/lib/accounting-period-server'
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
  const yearMonth = String(searchParams.get('yearMonth') || '').trim().slice(0, 7)
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
  if (storeFilter && (isOfficeStore(storeFilter) || isHeadOfficeLikeStoreName(storeFilter))) {
    storeFilter = 'All'
  }
  if (!isOfficeLevel) {
    if (!requestedStoreFilter || requestedStoreFilter === 'All') {
      storeFilter = String(allowedStores[0] || '').trim()
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
    const snapshot = await getAccountingPeriodCloseSnapshot(yearMonth, storeFilter)
    return NextResponse.json({ snapshot }, { headers })
  } catch (e) {
    console.error('getAccountingPeriodCloseStatus:', e)
    return NextResponse.json({ error: 'LOAD_FAILED' }, { status: 500, headers })
  }
}
