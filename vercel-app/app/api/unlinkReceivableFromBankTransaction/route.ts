import { NextRequest, NextResponse } from 'next/server'
import { unlinkReceivableAccrualsFromBankTransaction } from '@/lib/bank-receivable-link-server'
import { requireAuth } from '@/lib/verify-auth'

/** 통장 입금 ↔ 미수금(출고·주문) 연결 해제 */
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

    const result = await unlinkReceivableAccrualsFromBankTransaction(bankTransactionId)
    if (!result.ok) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: result.status || 400, headers }
      )
    }
    return NextResponse.json(
      { success: true, message: '미수금 연결이 해제되었습니다.', accrualIds: result.accrualIds },
      { headers }
    )
  } catch (e) {
    console.error('unlinkReceivableFromBankTransaction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
