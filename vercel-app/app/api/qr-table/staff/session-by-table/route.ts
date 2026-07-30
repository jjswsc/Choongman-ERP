import { NextRequest, NextResponse } from 'next/server'
import { getGuestOrderSummary, loadActiveSessionForTable } from '@/lib/qr-table-server'
import { requirePosStoreWriteAuth, posApiCorsHeaders, applyPosApiCors } from '@/lib/pos-api-write-auth'

export async function OPTIONS() {
  return applyPosApiCors(new NextResponse(null, { status: 204, headers: posApiCorsHeaders() }))
}

export async function GET(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const storeCode = String(req.nextUrl.searchParams.get('storeCode') || '').trim()
    const tableName = String(req.nextUrl.searchParams.get('tableName') || '').trim()
    const auth = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!auth.ok) return auth.response
    const session = await loadActiveSessionForTable(storeCode, tableName)
    const orderBalance = session ? await getGuestOrderSummary(session) : null
    return applyPosApiCors(
      NextResponse.json(
        {
          success: true,
          session,
          orderBalance: orderBalance
            ? {
                orderId: orderBalance.orderId,
                total: orderBalance.total,
                paymentQr: orderBalance.paymentQr,
                balanceDue: orderBalance.balanceDue,
                status: orderBalance.status,
              }
            : null,
        },
        { headers }
      )
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return applyPosApiCors(NextResponse.json({ success: false, message: msg }, { status: 400, headers }))
  }
}
