import { NextRequest, NextResponse } from 'next/server'
import { syncReceivableToOutboundView } from '@/lib/receivable-match-outbound'
import { canSyncOrderReceivable } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      authResult.errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      return authResult.errorResponse
    }
    const body = await request.json()
    const orderId = Number(body.orderId ?? body.orderRowId ?? body.row)
    const userRole = String(authResult.auth.role || '').toLowerCase()

    if (!orderId || Number.isNaN(orderId)) {
      return NextResponse.json({ success: false, message: 'orderId가 필요합니다.' }, { headers })
    }
    if (!canSyncOrderReceivable(userRole)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }

    const r = await syncReceivableToOutboundView(orderId)

    if (!r.ok) {
      return NextResponse.json({ success: false, message: r.message || '처리 실패' }, { headers })
    }

    return NextResponse.json(
      {
        success: true,
        orderId: r.orderId,
        subtotalHQ: r.subtotalHQ,
        totalHQ: r.totalHQ,
        removed: r.removed,
        usedCartFallback: r.usedCartFallback,
        message: r.message,
      },
      { headers }
    )
  } catch (e) {
    console.error('syncOrderReceivableFromOutbound:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
