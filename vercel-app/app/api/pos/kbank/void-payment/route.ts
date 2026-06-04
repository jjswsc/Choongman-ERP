import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { voidKbankPayment } from '@/lib/payments/kbank-client'
import { supabaseInsert } from '@/lib/supabase-server'
import type { KbankVoidPaymentRequest } from '@/lib/payments/kbank-types'
import { resolveKbankVoidTxnNoForRequest } from '@/lib/payments/kbank-api-reference'

export const dynamic = 'force-dynamic'

const KBANK_PARTNER_TXN_UID_MAX_LEN = 32

function withCorsHeaders(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

function buildVoidPartnerTxnUid(seed?: string): string {
  const s = String(seed || '').trim()
  if (s) return s.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
  const rand = Math.random().toString(36).slice(2, 8)
  return `VOD${Date.now()}${rand}`.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
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
    const txnNo = String(body.txnNo || '').trim()
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
    const voidPartnerTxnUid = buildVoidPartnerTxnUid(
      String(body.partnerTxnUid || rawPayload?.partnerTxnUid || '').trim()
    )
    const resolvedTxnNo =
      resolveKbankVoidTxnNoForRequest(String(txnNo || rawPayload?.txnNo || '').trim()) || ''

    if (!origPartnerTxnUid) {
      return withCorsHeaders(
        NextResponse.json(
          {
            success: false,
            message:
              'origPartnerTxnUid is required for Void Payment (original Generate partnerTxnUid).',
          },
          { status: 400 }
        )
      )
    }
    if (!resolvedTxnNo) {
      return withCorsHeaders(
        NextResponse.json(
          {
            success: false,
            statusCode: 'KBANK_TXN_NO_REQUIRED',
            message:
              'txnNo is required for Void Payment (numeric payment txnNo from callback/inquiry, not APIC* from Generate QR).',
          },
          { status: 400 }
        )
      )
    }

    const payload: KbankVoidPaymentRequest = {
      orderId: orderId > 0 ? orderId : undefined,
      storeCode: storeCode || undefined,
      origPartnerTxnUid,
      originalTransactionId: origPartnerTxnUid,
      terminalId: terminalId || undefined,
      txnNo: resolvedTxnNo,
      payload: {
        ...(rawPayload || {}),
        partnerTxnUid: voidPartnerTxnUid,
        origPartnerTxnUid,
        txnNo: resolvedTxnNo,
        ...(terminalId ? { terminalId } : {}),
      },
    }

    const result = await voidKbankPayment(payload)
    const responseData =
      result.response && typeof result.response === 'object'
        ? (result.response as Record<string, unknown>)
        : {}
    const responseTxnNo = String(responseData.txnNo || resolvedTxnNo || '').trim()

    try {
      await supabaseInsert('pos_payment_attempts', {
        order_id: orderId > 0 ? orderId : null,
        local_tx_id: `${String(result.requestId || voidPartnerTxnUid).slice(0, 33)}:VOID`,
        provider: 'kbank_qr_api',
        mode: 'openapi',
        tx_code: 'VOID',
        bank_id: 'KBANK',
        request_amount: 0,
        approved_amount: 0,
        response_code: result.statusCode || null,
        response_text: result.statusMessage || null,
        status: result.ok ? 'approved' : 'failed',
        error_reason: result.ok ? null : result.statusMessage || 'void_payment_failed',
        created_at: new Date().toISOString(),
      })
    } catch (e) {
      console.error('pos/kbank/void-payment attempt insert:', e)
    }

    return withCorsHeaders(
      NextResponse.json(
        {
          success: result.ok,
          message: result.ok ? undefined : result.statusMessage || 'void_payment_failed',
          partnerTransactionId: voidPartnerTxnUid,
          origPartnerTxnUid,
          txnNo: responseTxnNo || null,
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
    console.error('pos/kbank/void-payment:', e)
    return withCorsHeaders(
      NextResponse.json(
        { success: false, message: e instanceof Error ? e.message : 'kbank_void_payment_error' },
        { status: 500 }
      )
    )
  }
}
