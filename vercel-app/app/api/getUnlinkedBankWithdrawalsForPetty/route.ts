import { NextRequest, NextResponse } from 'next/server'
import { getUnlinkedBankWithdrawalsForPetty } from '@/lib/petty-bank-expense-link-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url)
    const accountId = Number(searchParams.get('accountId') || 0)
    const startStr = String(searchParams.get('startStr') || '').slice(0, 10)
    const endStr = String(searchParams.get('endStr') || '').slice(0, 10)

    const list = await getUnlinkedBankWithdrawalsForPetty({ accountId, startStr, endStr })
    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    console.error('getUnlinkedBankWithdrawalsForPetty:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '조회 실패', list: [] },
      { status: 500, headers }
    )
  }
}
