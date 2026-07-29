import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { getPp30SalesAdjustmentsForMonth } from '@/lib/pp30-sales-adjustment'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const userRole = String(authResult.auth.role || '').trim()

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message.includes('ACCOUNTING_')) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const url = new URL(request.url)
    const taxMonth = String(url.searchParams.get('taxMonth') || '').trim().slice(0, 7)
    if (!taxMonth || !/^\d{4}-\d{2}$/.test(taxMonth)) {
      return NextResponse.json({ success: false, error: 'INVALID_PARAMS' }, { status: 400, headers })
    }

    const rows = await getPp30SalesAdjustmentsForMonth('default', taxMonth)
    return NextResponse.json({ success: true, adjustments: rows }, { headers })
  } catch (err) {
    console.error('[getPp30SalesAdjustment]', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'UNKNOWN' },
      { status: 500, headers }
    )
  }
}
