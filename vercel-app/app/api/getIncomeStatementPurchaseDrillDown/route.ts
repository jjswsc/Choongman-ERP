import { NextRequest, NextResponse } from 'next/server'
import { computeIncomeStatementPurchaseDrillDown } from '@/lib/accounting-reports'
import { isAccountingStoreScopeForbidden } from '@/lib/accounting-store-scope'
import { requireAuth } from '@/lib/verify-auth'

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
  const yearMonth = String(searchParams.get('yearMonth') || searchParams.get('month') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const vendorKey = String(searchParams.get('vendorKey') || '').trim()

  if (!vendorKey) {
    return NextResponse.json({ error: 'vendorKey required' }, { status: 400, headers })
  }

  try {
    const data = await computeIncomeStatementPurchaseDrillDown({
      yearMonth,
      storeFilter,
      userStore,
      userRole,
      allowedStores: auth.allowedStores,
      vendorKey,
      tenantId: auth.tenantId,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    if (isAccountingStoreScopeForbidden(e)) {
      return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
    }
    console.error('getIncomeStatementPurchaseDrillDown:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
