import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { canDeleteStorePurchaseJournal } from '@/lib/permissions'
import { loadStorePurchaseJournals } from '@/lib/store-purchase-journal-admin'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    if (!canDeleteStorePurchaseJournal(authResult.auth.role || '')) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }

    const orderId = Math.floor(Number(new URL(request.url).searchParams.get('orderId') || 0))
    if (orderId <= 0) {
      return NextResponse.json({ success: false, message: 'orderId가 필요합니다.' }, { status: 400, headers })
    }

    const entries = await loadStorePurchaseJournals(orderId)
    return NextResponse.json(
      {
        success: true,
        orderId,
        hasJournal: entries.length > 0,
        entries,
      },
      { headers }
    )
  } catch (e) {
    console.error('getStorePurchaseJournal:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
