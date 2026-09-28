import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { isAccountingStoreScopeForbidden } from '@/lib/accounting-store-scope'
import { loadTaxManagementBridge } from '@/lib/tax-management-bridge-server'
import { requireAuth } from '@/lib/verify-auth'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  try {
    assertCanManageAccountingCompliance(String(auth.role || ''), String(auth.store || ''))
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }
  const { searchParams } = new URL(request.url)
  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const scopeFilter = String(searchParams.get('scopeFilter') || searchParams.get('storeFilter') || 'All').trim()
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }
  try {
    const data = await loadTaxManagementBridge({
      yearMonth,
      scopeFilter,
      userRole: auth.role,
      userStore: auth.store,
      allowedStores: auth.allowedStores,
      tenantId: auth.tenantId,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    if (isAccountingStoreScopeForbidden(e)) {
      return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
    }
    console.error('getTaxManagementBridge:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers })
  }
}
