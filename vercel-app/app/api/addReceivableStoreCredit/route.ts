import { NextRequest, NextResponse } from 'next/server'
import { canApproveReceivableBankMismatch } from '@/lib/bank-receivable-link-policy'
import { registerReceivableStoreCredit } from '@/lib/bank-receivable-store-credit'
import { requireAuth } from '@/lib/verify-auth'

/** 매장 선수금(과납분) 등록 — Director 또는 오피스 급여 담당 */
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
  if (
    !canApproveReceivableBankMismatch({
      role: auth.role,
      canManageOfficePayroll: auth.canManageOfficePayroll,
    })
  ) {
    return NextResponse.json(
      { success: false, message: 'Director 또는 오피스 급여 담당자만 선수금을 등록할 수 있습니다.' },
      { status: 403, headers }
    )
  }

  try {
    const body = await request.json()
    const storeName = String(body.storeName ?? body.store_name ?? '').trim()
    const amount = Number(body.amount ?? 0)
    const transDate = String(body.transDate ?? body.trans_date ?? '').slice(0, 10)
    const memo = String(body.memo ?? body.note ?? '').trim()

    const result = await registerReceivableStoreCredit({ storeName, amount, transDate, memo })
    return NextResponse.json(
      { success: true, message: '매장 선수금이 등록되었습니다.', id: result.id },
      { headers }
    )
  } catch (e) {
    console.error('addReceivableStoreCredit:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
