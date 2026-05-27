import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { cancelKbankQr } from '@/lib/payments/kbank-client'
import { supabaseInsert } from '@/lib/supabase-server'
import type { KbankCancelQrRequest } from '@/lib/payments/kbank-types'

export const dynamic = 'force-dynamic'

const KBANK_PARTNER_TXN_UID_MAX_LEN = 32

function withCorsHeaders(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

function buildCancelPartnerTxnUid(seed?: string): string {
  const s = String(seed || '').trim()
  if (s) return s.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
  const rand = Math.random().toString(36).slice(2, 8)
  return `CCH${Date.now()}${rand}`.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
}

export async function OPTIONS() {
  return withCorsHeaders(new NextResponse(null, { status: 204 }))
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, 'any')
  if (authResult.errorResponse) return withCorsHeaders(authResult.errorResponse)

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const orderId = Number(body.orderId || 0)
    const storeCode = String(body.storeCode || '').trim()
    const terminalId = String(body.terminalId || '').trim()
    const rawPayload =
      body.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : undefined
    const origPartnerTxnUid = String(
      body.origPartnerTxnUid ||
        body.originalTransactionId ||
        rawPayload?.origPartnerTxnUid ||
        ''
    ).trim()
    const cancelPartnerTxnUid = buildCancelPartnerTxnUid(
      String(body.partnerTxnUid || rawPayload?.partnerTxnUid || '').trim()
    )

    if (!origPartnerTxnUid) {
      return withCorsHeaders(
        NextResponse.json(
          {
            success: false,
            message:
              'origPartnerTxnUid is required for Cancel QR (original Generate partnerTxnUid).',
          },
          { status: 400 }
        )
      )
    }

    const payload: KbankCancelQrRequest = {
      orderId: orderId > 0 ? orderId : undefined,
      storeCode: storeCode || undefined,
      origPartnerTxnUid,
      originalTransactionId: origPartnerTxnUid,
      terminalId: terminalId || undefined,
      payload: {
        ...(rawPayload || {}),
        partnerTxnUid: cancelPartnerTxnUid,
        origPartnerTxnUid,
        ...(terminalId ? { terminalId } : {}),
      },
    }

    const result = await cancelKbankQr(payload)

    try {
      await supabaseInsert('pos_payment_attempts', {
        order_id: orderId > 0 ? orderId : null,
        local_tx_id: `${String(result.requestId || cancelPartnerTxnUid).slice(0, 34)}:CNL`,
        provider: 'kbank_qr_api',
        mode: 'openapi',
        tx_code: 'CANCEL',
        bank_id: 'KBANK',
        request_amount: 0,
        approved_amount: 0,
        response_code: result.statusCode || null,
        response_text: result.statusMessage || null,
        status: result.ok ? 'approved' : 'failed',
        error_reason: result.ok ? null : result.statusMessage || 'cancel_qr_failed',
        created_at: new Date().toISOString(),
      })
    } catch (e) {
      console.error('pos/kbank/cancel-qr attempt insert:', e)
    }

    return withCorsHeaders(
      NextResponse.json(
        {
          success: result.ok,
          message: result.ok ? undefined : result.statusMessage || 'cancel_qr_failed',
          partnerTransactionId: cancelPartnerTxnUid,
          origPartnerTxnUid,
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
    console.error('pos/kbank/cancel-qr:', e)
    return withCorsHeaders(
      NextResponse.json(
        { success: false, message: e instanceof Error ? e.message : 'kbank_cancel_qr_error' },
        { status: 500 }
      )
    )
  }
}
