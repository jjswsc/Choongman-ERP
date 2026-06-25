import { NextRequest, NextResponse } from 'next/server'
import { markBankTransactionForPettyCash } from '@/lib/petty-bank-expense-link-server'
import { requireAuth } from '@/lib/verify-auth'

/** 지출등록(이체)에서 통장 출금을 패티캐시 보충 연동 대기열에 등록 */
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
    const result = await markBankTransactionForPettyCash({
      bankTransactionId: Number(body.bankTransactionId ?? body.bank_transaction_id ?? 0),
    })

    if (!result.ok) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: result.status || 400, headers }
      )
    }

    return NextResponse.json(
      { success: true, message: '패티캐시 연동 대기열에 등록되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('markBankTransactionForPettyCash:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
