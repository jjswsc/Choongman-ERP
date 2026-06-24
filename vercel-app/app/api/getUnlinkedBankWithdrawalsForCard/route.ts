import { NextRequest, NextResponse } from 'next/server'
import { getUnlinkedBankWithdrawalsForCard } from '@/lib/card-bank-expense-link-server'
import { requireAuth } from '@/lib/verify-auth'

/** 카드 대금 연동용 미연결 통장 출금 목록 */
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

    if (!accountId || !startStr || !endStr) {
      return NextResponse.json({ list: [] }, { headers })
    }

    const list = await getUnlinkedBankWithdrawalsForCard({ accountId, startStr, endStr })
    return NextResponse.json({ list }, { headers })
  } catch (e) {
    console.error('getUnlinkedBankWithdrawalsForCard:', e)
    return NextResponse.json({ list: [] }, { headers })
  }
}
