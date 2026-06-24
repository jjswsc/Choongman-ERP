import { NextRequest, NextResponse } from 'next/server'
import { getBankWithdrawalsForCardBillQueueMark } from '@/lib/card-bank-expense-link-server'
import { parseMoneyAmount } from '@/lib/money-amount'
import { requireAuth } from '@/lib/verify-auth'

/** 지출등록(이체) — 카드대금 연동 대기열에 넣을 이체 출금 후보 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'office')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  try {
    const { searchParams } = new URL(request.url)
    const accountId = Number(searchParams.get('accountId') || 0)
    const startStr = String(searchParams.get('startStr') || '').slice(0, 10)
    const endStr = String(searchParams.get('endStr') || '').slice(0, 10)
    const amountRaw = searchParams.get('amount')
    const amount = amountRaw != null && amountRaw !== '' ? parseMoneyAmount(amountRaw) : null
    const transDate = String(searchParams.get('transDate') || '').slice(0, 10)

    const list = await getBankWithdrawalsForCardBillQueueMark({
      accountId,
      startStr,
      endStr,
      amount,
      transDate: transDate || null,
    })

    return NextResponse.json({ list }, { headers })
  } catch (e) {
    console.error('getBankWithdrawalsForCardBillQueueMark:', e)
    return NextResponse.json({ list: [] }, { headers })
  }
}
