import { NextRequest, NextResponse } from 'next/server'
import { registerCardExpenseFromBankTransaction } from '@/lib/card-bank-expense-link-server'
import { requireAuth } from '@/lib/verify-auth'

/** 통장 출금(신용카드 월 대금 등)을 카드 지출(expense)로 등록·연동 */
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
    const userName = String(authResult.auth.name || body.userName || body.user_name || '').trim()

    const result = await registerCardExpenseFromBankTransaction({
      bankTransactionId: Number(body.bankTransactionId ?? body.bank_transaction_id ?? 0),
      cardAccountId: Number(body.cardAccountId ?? body.card_account_id ?? 0),
      accountSubjectId: body.accountSubjectId ?? body.account_subject_id,
      memo: body.memo != null ? String(body.memo || '').trim() || null : undefined,
      note: body.note != null ? String(body.note || '').trim() || null : undefined,
      postedBy: userName || null,
    })

    if (!result.ok) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: result.status || 400, headers }
      )
    }

    return NextResponse.json(
      { success: true, message: '카드 지출로 등록되었습니다.', id: result.id },
      { headers }
    )
  } catch (e) {
    console.error('registerCardExpenseFromBankTransaction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
