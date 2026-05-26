import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { settleKbankPayment } from '@/lib/payments/kbank-client'
import { supabaseInsert } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function withCorsHeaders(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

export async function OPTIONS() {
  return withCorsHeaders(new NextResponse(null, { status: 204 }))
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, 'any')
  if (authResult.errorResponse) return withCorsHeaders(authResult.errorResponse)

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const partnerTransactionId = String(body.partnerTransactionId || '').trim()
    const originalTransactionId = String(body.originalTransactionId || '').trim()
    const refId = String(body.refId || '').trim()
    const orderId = Number(body.orderId || 0)
    const storeCode = String(body.storeCode || '').trim()

    const result = await settleKbankPayment({
      partnerTransactionId: partnerTransactionId || undefined,
      originalTransactionId: originalTransactionId || undefined,
      refId: refId || undefined,
      orderId: orderId > 0 ? orderId : undefined,
      storeCode: storeCode || undefined,
      payload: body.payload && typeof body.payload === 'object' ? (body.payload as Record<string, unknown>) : undefined,
    })

    try {
      await supabaseInsert('pos_payment_attempts', {
        order_id: orderId > 0 ? orderId : null,
        local_tx_id: `${String(result.requestId || partnerTransactionId || Date.now()).slice(0, 31)}:SETTLE`,
        provider: 'kbank_qr_api',
        mode: 'openapi',
        tx_code: 'SETTLEMENT',
        bank_id: 'KBANK',
        request_amount: 0,
        approved_amount: 0,
        response_code: result.statusCode || null,
        response_text: result.statusMessage || null,
        status: result.ok ? 'approved' : 'failed',
        error_reason: result.ok ? null : (result.statusMessage || 'settlement_failed'),
        created_at: new Date().toISOString(),
      })
    } catch (e) {
      console.error('pos/kbank/settlement attempt insert:', e)
    }

    return withCorsHeaders(
      NextResponse.json(
        {
          success: result.ok,
          partnerTransactionId: partnerTransactionId || null,
          originalTransactionId: originalTransactionId || null,
          refId: refId || null,
          orderId: orderId > 0 ? orderId : null,
          storeCode: storeCode || null,
          statusCode: result.statusCode || null,
          statusMessage: result.statusMessage || null,
          data: result.response,
        },
        { status: result.ok ? 200 : 422 }
      )
    )
  } catch (e) {
    console.error('pos/kbank/settlement:', e)
    return withCorsHeaders(
      NextResponse.json(
        { success: false, message: e instanceof Error ? e.message : 'kbank_settlement_error' },
        { status: 500 }
      )
    )
  }
}
