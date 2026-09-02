import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { checkKbankQrStatus } from '@/lib/payments/kbank-client'
import { supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import type { KbankCheckStatusRequest } from '@/lib/payments/kbank-types'
import {
  extractKbankPaymentTxnNo,
  isKbankPaymentTxnNo,
  normalizeKbankTxnStatusToPos,
} from '@/lib/payments/kbank-api-reference'
import { integrationScopeFromAuth } from '@/lib/integration-scope-from-auth'
import { resolveKbankRuntime } from '@/lib/tenant-integration-resolve'

export const dynamic = 'force-dynamic'

function withCorsHeaders(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

function normalizeStatusLabel(txnStatus: unknown, statusCode?: unknown): string {
  return normalizeKbankTxnStatusToPos(txnStatus, statusCode)
}

function parseAmount(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

function extractApprovedAmount(json: Record<string, unknown>): number {
  const topCandidates = [
    json.txnAmount,
    json.amount,
    json.transactionAmount,
    json.approvedAmount,
    json.totalAmount,
  ]
  for (const c of topCandidates) {
    const amount = parseAmount(c)
    if (amount > 0) return amount
  }
  const data = json.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const nestedCandidates = [d.txnAmount, d.amount, d.transactionAmount, d.approvedAmount, d.totalAmount]
    for (const c of nestedCandidates) {
      const amount = parseAmount(c)
      if (amount > 0) return amount
    }
  }
  return 0
}

function extractTxnStatus(json: Record<string, unknown>): string {
  const statusCode = String(json.statusCode || '').trim()
  const topCandidates = [
    json.txnStatus,
    json.transactionStatus,
    json.status,
    json.paymentStatus,
  ]
  for (const c of topCandidates) {
    if (String(c || '').trim()) {
      return normalizeStatusLabel(c, statusCode)
    }
  }
  const data = json.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const nestedCandidates = [d.txnStatus, d.transactionStatus, d.status, d.paymentStatus]
    for (const c of nestedCandidates) {
      if (String(c || '').trim()) {
        return normalizeStatusLabel(c, statusCode)
      }
    }
  }
  return normalizeStatusLabel('', statusCode)
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
    const orderId = Number(body.orderId || 0)
    const storeCode = String(body.storeCode || '').trim()
    const partnerTransactionId = String(body.partnerTransactionId || '').trim()
    const originalTransactionId = String(body.originalTransactionId || '').trim()
    const refId = String(body.refId || '').trim()
    const terminalId = String(body.terminalId || '').trim()
    const txnNo = String(body.txnNo || '').trim()
    const rawPayload =
      body.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : undefined
    const qrType = String(body.qrType || rawPayload?.qrType || '').trim()
    const payloadOrigPartnerTxnUid = String(rawPayload?.origPartnerTxnUid || '').trim()

    if (!partnerTransactionId && !originalTransactionId && !refId && !payloadOrigPartnerTxnUid) {
      return withCorsHeaders(
        NextResponse.json(
          {
            success: false,
            message:
              'origPartnerTxnUid is required for Inquire Payment. Pass originalTransactionId or payload.origPartnerTxnUid.',
          },
          { status: 400 }
        )
      )
    }

    const payload: KbankCheckStatusRequest = {
      orderId: orderId > 0 ? orderId : undefined,
      storeCode: storeCode || undefined,
      partnerTransactionId: partnerTransactionId || undefined,
      originalTransactionId: originalTransactionId || undefined,
      refId: refId || undefined,
      terminalId: terminalId || undefined,
      txnNo: txnNo || undefined,
      payload: {
        ...(rawPayload || {}),
        ...(qrType ? { qrType } : {}),
      },
    }

    const requestedAt = new Date().toISOString()
    const kbankRuntime = await resolveKbankRuntime(integrationScopeFromAuth(authResult.auth, storeCode))
    const result = await checkKbankQrStatus(payload, { runtime: kbankRuntime })
    const statusLabel = extractTxnStatus(result.response)
    const approvedAmount = statusLabel === 'approved' ? extractApprovedAmount(result.response) : 0
    const paymentTxnNo = extractKbankPaymentTxnNo(result.response).slice(0, 20)
    const paymentTxnNoFields = isKbankPaymentTxnNo(paymentTxnNo)
      ? {
          trace_no: paymentTxnNo.slice(0, 40),
          approval_code: paymentTxnNo.slice(0, 20),
        }
      : {}

    try {
      await supabaseInsert('pos_payment_attempts', {
        order_id: orderId > 0 ? orderId : null,
        local_tx_id:
          result.requestId.slice(0, 40) || `CHK${Date.now()}`,
        provider: 'kbank_qr_api',
        mode: 'openapi',
        tx_code: 'STATUS',
        bank_id: 'KBANK',
        request_amount: 0,
        approved_amount: approvedAmount,
        response_code: result.statusCode || null,
        response_text: result.statusMessage || null,
        status: result.ok ? statusLabel : 'failed',
        error_reason: result.ok ? null : result.statusMessage || 'check_status_failed',
        ...paymentTxnNoFields,
        created_at: requestedAt,
      })
    } catch (insertErr) {
      console.error('pos/kbank/check-status attempt insert:', insertErr)
    }

    if (partnerTransactionId) {
      try {
        await supabaseUpdateByFilter(
          'pos_payment_attempts',
          `local_tx_id=eq.${encodeURIComponent(partnerTransactionId.slice(0, 40))}`,
          {
            ...(orderId > 0 ? { order_id: orderId } : {}),
            status: statusLabel,
            response_code: result.statusCode || null,
            response_text: result.statusMessage || null,
            approved_amount: approvedAmount,
            ...paymentTxnNoFields,
          }
        )
      } catch (updateErr) {
        console.error('pos/kbank/check-status attempt update:', updateErr)
      }
    }

    const httpStatus = result.ok ? 200 : 422
    return withCorsHeaders(
      NextResponse.json(
        {
          success: result.ok,
          orderId: orderId > 0 ? orderId : null,
          storeCode: storeCode || null,
          partnerTransactionId: partnerTransactionId || null,
          originalTransactionId: originalTransactionId || null,
          refId: refId || null,
          statusCode: result.statusCode || null,
          statusMessage: result.statusMessage || null,
          status: statusLabel,
          data: result.response,
        },
        { status: httpStatus }
      )
    )
  } catch (e) {
    console.error('pos/kbank/check-status:', e)
    return withCorsHeaders(
      NextResponse.json(
        {
          success: false,
          message: e instanceof Error ? e.message : 'kbank_check_status_error',
        },
        { status: 500 }
      )
    )
  }
}
