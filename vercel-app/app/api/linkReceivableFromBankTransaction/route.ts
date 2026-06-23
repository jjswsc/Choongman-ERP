import { NextRequest, NextResponse } from 'next/server'
import { linkReceivableAccrualsFromBankTransaction } from '@/lib/bank-receivable-link-server'
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
    const rawIds =
      body.receivableAccrualIds ??
      body.receivable_accrual_ids ??
      body.receivableIds ??
      body.receivable_ids
    const receivableAccrualIds = Array.isArray(rawIds)
      ? rawIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)
      : (() => {
          const single = Number(
            body.receivableAccrualId ??
              body.receivable_accrual_id ??
              body.receivableId ??
              body.receivable_id ??
              0
          )
          return single > 0 ? [single] : []
        })()

    const result = await linkReceivableAccrualsFromBankTransaction({
      bankTransactionId,
      receivableAccrualIds,
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
