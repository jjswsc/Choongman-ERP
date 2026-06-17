import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { canDeleteStorePurchaseJournal } from '@/lib/permissions'
import { removeStorePurchaseJournals } from '@/lib/store-purchase-journal-admin'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }
    if (!canDeleteStorePurchaseJournal(authResult.auth.role || '')) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }

    const body = (await request.json()) as { orderId?: number | string }
    const orderId = Math.floor(Number(body.orderId || 0))
    if (orderId <= 0) {
      return NextResponse.json({ success: false, message: 'orderId가 필요합니다.' }, { status: 400, headers })
    }

    const deletedCount = await removeStorePurchaseJournals(orderId)
    if (deletedCount <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: '삭제할 store_purchase 분개가 없습니다.',
          orderId,
          deletedCount: 0,
        },
        { status: 404, headers }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: '매장 매입 분개가 삭제되었습니다. 물류팀이 출고 이력에서 IV 삭제를 진행할 수 있습니다.',
        orderId,
        deletedCount,
      },
      { headers }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'ACCOUNTING_PERIOD_CLOSED') {
      return NextResponse.json(
        {
          success: false,
          message: '마감된 회계 기간의 분개는 삭제할 수 없습니다.',
          code: 'ACCOUNTING_PERIOD_CLOSED',
        },
        { status: 409, headers }
      )
    }
    console.error('deleteStorePurchaseJournal:', e)
    return NextResponse.json({ success: false, message: '오류: ' + msg }, { status: 500, headers })
  }
}
