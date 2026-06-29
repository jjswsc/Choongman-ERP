import { NextRequest, NextResponse } from 'next/server'
import { loadLinkedReceivablesForBankTx } from '@/lib/bank-receivable-link-server'
import { requireAuth } from '@/lib/verify-auth'

/** 통장 입금에 연결된 미수금(출고·주문) 목록 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'office')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Content-Type', 'application/json')
    return authResult.errorResponse
  }

  try {
    const { searchParams } = new URL(request.url)
    const bankTransactionId = Number(searchParams.get('bankTransactionId') || 0)
    if (!bankTransactionId) {
      return NextResponse.json(
        { success: false, message: '통장 거래 ID가 필요합니다.', items: [], summary: null },
        { status: 400, headers }
      )
    }

    const result = await loadLinkedReceivablesForBankTx(bankTransactionId)
    if (!result) {
      return NextResponse.json(
        { success: false, message: '연결된 미수금이 없습니다.', items: [], summary: null },
        { status: 404, headers }
      )
    }

    return NextResponse.json(
      { success: true, items: result.items, summary: result.summary },
      { headers }
    )
  } catch (e) {
    console.error('getLinkedReceivablesForBankTx:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : '조회 실패',
        items: [],
        summary: null,
      },
      { status: 500, headers }
    )
  }
}
