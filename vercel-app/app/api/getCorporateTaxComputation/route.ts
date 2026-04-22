import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { computeCorporateTaxComputation } from '@/lib/corporate-tax'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

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
  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'half_year' || periodTypeRaw === 'annual' ? periodTypeRaw : 'monthly'
  let storeFilter = String(searchParams.get('storeFilter') || 'All').trim()
  const userStore = String(auth.store || '').trim()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)
  const taxRateRaw = Number(searchParams.get('taxRate'))

  const isScopedRole =
    !isOfficeRole(userRole) && !isAccountingRole(userRole) &&
    (userRole.toLowerCase().includes('manager') || userRole.toLowerCase().includes('franchisee'))
  if (isScopedRole) {
    if (!storeFilter || storeFilter === 'All' || storeFilter === '전체') {
      const fallbackStore = String(allowedStores[0] || '').trim()
      if (!fallbackStore) return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      storeFilter = fallbackStore
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeFilter))
      if (!allowed) return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
    }
  }

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const data = await computeCorporateTaxComputation({
      yearMonth,
      periodType,
      storeFilter,
      userStore,
      userRole,
      taxRate: Number.isFinite(taxRateRaw) ? taxRateRaw : undefined,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getCorporateTaxComputation:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

