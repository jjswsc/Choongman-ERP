import { NextRequest, NextResponse } from 'next/server'
import { getCardBillAllocation } from '@/lib/card-bill-allocation-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'office')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  try {
    const parentId = Number(new URL(request.url).searchParams.get('parentId') || 0)
    const result = await getCardBillAllocation(parentId)
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status || 400, headers })
    }
    return NextResponse.json({ success: true, header: result.header, lines: result.lines }, { headers })
  } catch (e) {
    console.error('getCardBillAllocation:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '조회 실패' },
      { status: 500, headers }
    )
  }
}
