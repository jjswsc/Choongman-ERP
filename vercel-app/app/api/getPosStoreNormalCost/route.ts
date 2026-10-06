import { NextRequest, NextResponse } from 'next/server'
import { isAccountingStoreScopeForbidden } from '@/lib/accounting-store-scope'
import { computePosStoreNormalCost } from '@/lib/pos-store-normal-cost-load'
import { canAccessPosCostAnalysis } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  if (!canAccessPosCostAnalysis(String(auth.role || ''))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
  }

  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || '').trim()
  const endStr = String(searchParams.get('endStr') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()

  if (!startStr || !endStr) {
    return NextResponse.json({ error: 'MISSING_DATE_RANGE' }, { status: 400, headers })
  }

  try {
    const data = await computePosStoreNormalCost({
      startStr,
      endStr,
      storeFilter,
      auth: {
        userRole: auth.role,
        userStore: auth.store,
        allowedStores: auth.allowedStores,
        tenantId: auth.tenantId,
      },
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    if (isAccountingStoreScopeForbidden(e)) {
      return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
    }
    console.error('getPosStoreNormalCost:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
