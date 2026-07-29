import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { assertCanManageAccountingCompliance, assertCanWriteAccountingCompliance } from '@/lib/accounting-auth'
import { savePp30SalesAdjustment } from '@/lib/pp30-sales-adjustment'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const userRole = String(auth.role || '').trim()
  const actor = String(auth.name || auth.employeeCode || auth.employeeId || '').trim() || null

  try {
    assertCanManageAccountingCompliance(userRole)
    assertCanWriteAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message.includes('ACCOUNTING_')) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const body = await request.json().catch(() => ({}))
    const storeName = String(body.storeName || body.store_name || '').trim()
    const taxMonth = String(body.taxMonth || body.tax_month || '').trim().slice(0, 7)
    if (!storeName || !taxMonth || !/^\d{4}-\d{2}$/.test(taxMonth)) {
      return NextResponse.json({ success: false, error: 'INVALID_PARAMS' }, { status: 400, headers })
    }

    await savePp30SalesAdjustment('default', {
      store_name: storeName,
      tax_month: taxMonth,
      exclude_cash: !!body.excludeCash,
      exclude_card: !!body.excludeCard,
      exclude_qr: !!body.excludeQr,
      exclude_delivery_app: !!body.excludeDeliveryApp,
      exclude_other: !!body.excludeOther,
      cash_ratio: body.cashRatio,
      card_ratio: body.cardRatio,
      qr_ratio: body.qrRatio,
      delivery_ratio: body.deliveryRatio,
      other_ratio: body.otherRatio,
      memo: body.memo ?? null,
    }, actor)

    return NextResponse.json({ success: true }, { headers })
  } catch (err) {
    console.error('[savePp30SalesAdjustment]', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'UNKNOWN' },
      { status: 500, headers }
    )
  }
}
