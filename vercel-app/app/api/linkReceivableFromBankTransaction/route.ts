import { NextRequest, NextResponse } from 'next/server'
import { linkReceivableAccrualFromBankTransaction } from '@/lib/bank-receivable-link-server'
import { requireAuth } from '@/lib/verify-auth'

/** 통장 입금 ↔ 미수금(출고·주문) 연결 */
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
    const receivableAccrualId = Number(
      body.receivableAccrualId ?? body.receivable_accrual_id ?? body.receivableId ?? body.receivable_id ?? 0
    )

    const result = await linkReceivableAccrualFromBankTransaction({
      bankTransactionId,
      receivableAccrualId,
    })
    if (!result.ok) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: result.status || 400, headers }
      )
    }
    return NextResponse.json({ success: true, message: '미수금과 연결되었습니다.' }, { headers })
  } catch (e) {
    console.error('linkReceivableFromBankTransaction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
