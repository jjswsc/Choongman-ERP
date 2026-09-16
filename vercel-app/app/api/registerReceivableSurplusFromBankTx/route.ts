import { NextRequest, NextResponse } from 'next/server'
import { registerSurplusCreditFromLinkedBankTx } from '@/lib/bank-receivable-link-server'
import { requireAuth } from '@/lib/verify-auth'

/** 이미 연결된 과납 입금 → 다음 입금 상계용 선수금 적립 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  const authResult = await requireAuth(request, 'office')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Content-Type', 'application/json')
    return authResult.errorResponse
  }

  try {
    const body = await request.json()
    const bankTransactionId = Number(body.bankTransactionId ?? body.bank_transaction_id ?? 0)
    const result = await registerSurplusCreditFromLinkedBankTx(bankTransactionId)
    if (!result.ok) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: result.status || 400, headers }
      )
    }
    return NextResponse.json(
      {
        success: true,
        message: `과납 선수금 ฿${result.amount.toLocaleString()}이 적립되었습니다.`,
        amount: result.amount,
      },
      { headers }
    )
  } catch (e) {
    console.error('registerReceivableSurplusFromBankTx:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
