import { NextRequest, NextResponse } from 'next/server'
import { computeManagementMarginBridge } from '@/lib/management-margin-bridge'
import { isAccountingStoreScopeForbidden } from '@/lib/accounting-store-scope'
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
  const { searchParams } = new URL(request.url)
  const yearMonthStart = String(searchParams.get('yearMonthStart') || searchParams.get('yearMonth') || '').trim()
  const yearMonthEnd = String(searchParams.get('yearMonthEnd') || yearMonthStart).trim()
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()

  try {
    const data = await computeManagementMarginBridge({
      yearMonth: yearMonthEnd,
      yearMonthStart,
      yearMonthEnd,
      storeFilter,
      userStore,
      userRole,
      allowedStores: auth.allowedStores,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    if (isAccountingStoreScopeForbidden(e)) {
      return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
    }
    console.error('getManagementMarginBridge:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
