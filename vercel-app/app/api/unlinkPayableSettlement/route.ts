import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { canMutateManualPayableBalance } from '@/lib/permissions'
import { unlinkPayableSettlementTransaction } from '@/lib/payable-settlement-link-server'

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return headers
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders()
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const userRole = String(authResult.auth.role || '').toLowerCase()
    if (!canMutateManualPayableBalance(userRole)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { headers })
    }

    const body = await request.json()
    const transactionId = Number(body.transactionId ?? body.transaction_id ?? body.id ?? 0)
    const result = await unlinkPayableSettlementTransaction(transactionId)
    return NextResponse.json(result, { status: result.success ? 200 : 400, headers })
  } catch (e) {
    console.error('unlinkPayableSettlement:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}
