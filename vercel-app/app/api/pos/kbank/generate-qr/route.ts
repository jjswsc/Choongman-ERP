import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { generateKbankQr } from '@/lib/payments/kbank-client'
import { supabaseInsert } from '@/lib/supabase-server'
import type { KbankGenerateQrRequest } from '@/lib/payments/kbank-types'

export const dynamic = 'force-dynamic'

function withCorsHeaders(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

function toSafeNumber(v: unknown): number {
  const raw = typeof v === 'string' ? v.replace(/,/g, '').trim() : v
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function normalizeQrType(v: unknown): { raw: string; normalized: 'THAI_QR' | 'CREDIT_CARD' | '' } {
  const raw = String(v || '').trim()
  if (!raw) return { raw: '', normalized: '' }
  const key = raw
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/__+/g, '_')
  if (key.includes('CREDIT') || key.includes('CARD') || key === 'QRCC') {
    return { raw, normalized: 'CREDIT_CARD' }
  }
  if (key.includes('THAI') || key === 'THQR' || key === 'THAI_QR') {
    return { raw, normalized: 'THAI_QR' }
  }
  return { raw, normalized: '' }
}

function buildPartnerTransactionId(seed?: string): string {
  const s = String(seed || '').trim()
  if (s) return s.slice(0, 15)
  const rand = Math.random().toString(36).slice(2, 10)
  return `P${Date.now()}${rand}`.slice(0, 15)
}

export async function OPTIONS() {
  return withCorsHeaders(new NextResponse(null, { status: 204 }))
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, 'any')
  if (authResult.errorResponse) {
    return withCorsHeaders(authResult.errorResponse)
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const amount = toSafeNumber(body.amount)
    const orderId = Number(body.orderId || 0)
    const storeCode = String(body.storeCode || '').trim()
    const partnerTransactionId = buildPartnerTransactionId(
      String(body.partnerTransactionId || body.partnerTxnUid || '')
    )
    const qrTypeInfo = normalizeQrType(body.qrType)
    const qrType = qrTypeInfo.normalized || qrTypeInfo.raw || undefined

    if (amount <= 0) {
      return withCorsHeaders(
        NextResponse.json(
          { success: false, message: 'amount는 0보다 커야 합니다.' },
          { status: 400 }
        )
      )
    }
    if (qrTypeInfo.normalized === 'THAI_QR' && amount > 80000) {
      return withCorsHeaders(
        NextResponse.json(
          {
            success: false,
            statusCode: 'AMOUNT_LIMIT_EXCEEDED',
            message: 'Thai QR는 80,000 THB 이하 금액만 생성할 수 있습니다.',
          },
          { status: 422 }
        )
      )
    }

    const payload: KbankGenerateQrRequest = {
      amount,
      qrType,
      orderId: orderId > 0 ? orderId : undefined,
      storeCode: storeCode || undefined,
      partnerTransactionId,
      reference1: String(body.reference1 || '').trim() || undefined,
      reference2: String(body.reference2 || '').trim() || undefined,
      reference3: String(body.reference3 || '').trim() || undefined,
      reference4: String(body.reference4 || '').trim() || undefined,
      payload:
        body.payload && typeof body.payload === 'object'
          ? (body.payload as Record<string, unknown>)
          : undefined,
    }

    const requestedAt = new Date().toISOString()
    const result = await generateKbankQr(payload)

    try {
      await supabaseInsert('pos_payment_attempts', {
        order_id: orderId > 0 ? orderId : null,
        local_tx_id: partnerTransactionId,
        provider: 'kbank_qr_api',
        mode: 'openapi',
        tx_code: 'QR',
        bank_id: 'KBANK',
        request_amount: amount,
        approved_amount: 0,
        response_code: result.statusCode || null,
        response_text: result.statusMessage || null,
        status: result.ok ? 'pending' : 'failed',
        error_reason: result.ok ? null : result.statusMessage || 'generate_qr_failed',
        created_at: requestedAt,
      })
    } catch (insertErr) {
      console.error('pos/kbank/generate-qr attempt insert:', insertErr)
    }

    const status = result.ok ? 200 : 422
    const responseData = result.response && typeof result.response === 'object'
      ? (result.response as Record<string, unknown>)
      : {}
    const responseCode = String(responseData.code || '').trim()
    const responseMessage = String(responseData.message || '').trim()
    const failureMessage =
      result.statusMessage ||
      responseMessage ||
      responseCode ||
      'kbank_generate_qr_failed'
    return withCorsHeaders(
      NextResponse.json(
        {
          success: result.ok,
          message: result.ok ? undefined : failureMessage,
          partnerTransactionId,
          qrType: qrType || null,
          amount,
          orderId: orderId > 0 ? orderId : null,
          storeCode: storeCode || null,
          statusCode: result.statusCode || responseCode || null,
          statusMessage: result.statusMessage || responseMessage || null,
          data: result.response,
        },
        { status }
      )
    )
  } catch (e) {
    console.error('pos/kbank/generate-qr:', e)
    return withCorsHeaders(
      NextResponse.json(
        {
          success: false,
          message: e instanceof Error ? e.message : 'kbank_generate_qr_error',
        },
        { status: 500 }
      )
    )
  }
}
