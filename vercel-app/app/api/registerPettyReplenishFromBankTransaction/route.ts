import { NextRequest, NextResponse } from 'next/server'
import { registerPettyReplenishFromBankTransaction } from '@/lib/petty-bank-expense-link-server'
import { requireAuth } from '@/lib/verify-auth'

/** 통장 이체 출금 → 패티캐시 보충 등록 */
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
  const auth = authResult.auth

  try {
    const body = await request.json()
    const userEmployeeId =
      auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
        ? Math.floor(Number(auth.employeeId))
        : null
    const userEmployeeCode = String(auth.employeeCode || '').trim() || null
    const postedBy = String(auth.name || body.userName || body.user_name || '').trim() || null

    const result = await registerPettyReplenishFromBankTransaction({
      bankTransactionId: Number(body.bankTransactionId ?? body.bank_transaction_id ?? 0),
      store: String(body.store || body.storeName || body.store_name || '').trim(),
      memo: body.memo != null ? String(body.memo || '').trim() : undefined,
      postedBy,
      userEmployeeId,
      userEmployeeCode,
    })

    if (!result.ok) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: result.status || 400, headers }
      )
    }

    return NextResponse.json({ success: true, id: result.id, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('registerPettyReplenishFromBankTransaction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
