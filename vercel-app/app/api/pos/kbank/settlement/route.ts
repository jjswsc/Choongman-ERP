import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { settleKbankPayment } from '@/lib/payments/kbank-client'
import { supabaseInsert } from '@/lib/supabase-server'
import type { KbankSettlementRequest } from '@/lib/payments/kbank-types'
import { integrationScopeFromAuth } from '@/lib/integration-scope-from-auth'
import { resolveKbankRuntime } from '@/lib/tenant-integration-resolve'

export const dynamic = 'force-dynamic'

const KBANK_PARTNER_TXN_UID_MAX_LEN = 32

function withCorsHeaders(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

function buildSettlementPartnerTxnUid(seed?: string): string {
  const s = String(seed || '').trim()
  if (s) return s.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
  const rand = Math.random().toString(36).slice(2, 8)
  return `STM${Date.now()}${rand}`.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
}

function normalizeSettlementQrType(v: unknown): 'THAI_QR' | 'CREDIT_CARD' | '' {
  const raw = String(v || '').trim()
  if (!raw) return ''
  const key = raw
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/__+/g, '_')
  if (key.includes('CREDIT') || key.includes('CARD') || key === 'QRCC' || key === '5') {
    return 'CREDIT_CARD'
  }
  if (key.includes('THAI') || key === 'THQR' || key === 'THAI_QR' || key === '3') {
    return 'THAI_QR'
  }
  return ''
}

function parseSettlementAmount(json: Record<string, unknown>): number {
  const n = Number(json.settlementAmount)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
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
    const rawPayload =
      body.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : undefined
    const scope = integrationScopeFromAuth(authResult.auth, storeCode)
    const kbankRuntime = await resolveKbankRuntime(scope)
    const terminalId = String(
      body.terminalId || rawPayload?.terminalId || kbankRuntime.terminalId || process.env.KBANK_TERMINAL_ID || ''
    ).trim()
    const qrTypeInfo = normalizeSettlementQrType(body.qrType || rawPayload?.qrType)
    const qrType = qrTypeInfo || 'THAI_QR'
    const settlementPartnerTxnUid = buildSettlementPartnerTxnUid(
      String(body.partnerTxnUid || rawPayload?.partnerTxnUid || '').trim()
    )

    if (qrType === 'CREDIT_CARD') {
      return withCorsHeaders(
        NextResponse.json(
          {
            success: false,
            statusCode: 'SETTLEMENT_NOT_SUPPORTED',
            message:
              'Manual Settlement is not supported for Credit Card QR. Only Thai QR supports immediate settlement.',
          },
          { status: 422 }
        )
      )
    }
    if (!terminalId) {
      return withCorsHeaders(
        NextResponse.json(
          {
            success: false,
            statusCode: 'KBANK_TERMINAL_ID_REQUIRED',
            message:
              'terminalId is required for Settlement. Set it in the POS KBank panel or KBANK_TERMINAL_ID.',
          },
          { status: 422 }
        )
      )
    }

    const payload: KbankSettlementRequest = {
      orderId: orderId > 0 ? orderId : undefined,
      storeCode: storeCode || undefined,
      terminalId,
      qrType: 'THAI_QR',
      payload: {
        ...(rawPayload || {}),
        partnerTxnUid: settlementPartnerTxnUid,
        terminalId,
        qrType: 'THAI_QR',
      },
    }

    const result = await settleKbankPayment(payload, { runtime: kbankRuntime })
    const responseData =
      result.response && typeof result.response === 'object'
        ? (result.response as Record<string, unknown>)
        : {}
    const settlementAmount = result.ok ? parseSettlementAmount(responseData) : 0

    try {
      await supabaseInsert('pos_payment_attempts', {
        order_id: orderId > 0 ? orderId : null,
        local_tx_id: `${String(result.requestId || settlementPartnerTxnUid).slice(0, 31)}:SETTLE`,
        provider: 'kbank_qr_api',
        mode: 'openapi',
        tx_code: 'SETTLEMENT',
        bank_id: 'KBANK',
        request_amount: 0,
        approved_amount: settlementAmount,
        response_code: result.statusCode || null,
        response_text: result.statusMessage || null,
        status: result.ok ? 'approved' : 'failed',
        error_reason: result.ok ? null : result.statusMessage || 'settlement_failed',
        created_at: new Date().toISOString(),
      })
    } catch (e) {
      console.error('pos/kbank/settlement attempt insert:', e)
    }

    return withCorsHeaders(
      NextResponse.json(
        {
          success: result.ok,
          message: result.ok ? undefined : result.statusMessage || 'settlement_failed',
          partnerTransactionId: settlementPartnerTxnUid,
          settlementAmount: settlementAmount || null,
          settlementCurrencyCode: String(responseData.settlementCurrencyCode || 'THB') || null,
          accountNo: String(responseData.accountNo || '') || null,
          accountName: String(responseData.accountName || '') || null,
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
