import { NextRequest, NextResponse } from 'next/server'
import { computeTrialBalanceReport } from '@/lib/trial-balance-report'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
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
  const userRole = String(auth.role || '').trim()

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()
  const userStore = String(auth.store || '').trim()

  try {
    const data = await computeTrialBalanceReport({
      yearMonth,
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
    console.error('getTrialBalance:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
