import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { checkKbankQrStatus } from '@/lib/payments/kbank-client'
import { supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import type { KbankCheckStatusRequest } from '@/lib/payments/kbank-types'

export const dynamic = 'force-dynamic'

function withCorsHeaders(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

function normalizeStatusLabel(v: unknown): string {
  const s = String(v || '').trim().toUpperCase()
  if (!s) return ''
  if (s.includes('PAID') || s.includes('SUCCESS')) return 'approved'
  if (s.includes('VOID') || s.includes('CANCEL') || s.includes('FAIL') || s.includes('DECLINE')) return 'declined'
  if (s.includes('PENDING') || s.includes('PROCESS')) return 'pending'
  return 'pending'
}

function parseAmount(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

function extractApprovedAmount(json: Record<string, unknown>): number {
  const topCandidates = [
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
    const nestedCandidates = [d.amount, d.transactionAmount, d.approvedAmount, d.totalAmount]
    for (const c of nestedCandidates) {
      const amount = parseAmount(c)
      if (amount > 0) return amount
    }
  }
  return 0
}

function extractTxnStatus(json: Record<string, unknown>): string {
  const topCandidates = [
    json.transactionStatus,
    json.status,
    json.paymentStatus,
    json.txnStatus,
  ]
  for (const c of topCandidates) {
    const status = normalizeStatusLabel(c)
    if (status) return status
  }
  const data = json.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const nestedCandidates = [d.transactionStatus, d.status, d.paymentStatus, d.txnStatus]
    for (const c of nestedCandidates) {
      const status = normalizeStatusLabel(c)
      if (status) return status
    }
  }
  return 'pending'
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

    if (!partnerTransactionId && !originalTransactionId && !refId) {
      return withCorsHeaders(
        NextResponse.json(
          {
            success: false,
            message: 'partnerTransactionId, originalTransactionId, refId 중 하나는 필요합니다.',
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
      payload:
        body.payload && typeof body.payload === 'object'
          ? (body.payload as Record<string, unknown>)
          : undefined,
    }

    const requestedAt = new Date().toISOString()
    const result = await checkKbankQrStatus(payload)
    const statusLabel = extractTxnStatus(result.response)
    const approvedAmount = statusLabel === 'approved' ? extractApprovedAmount(result.response) : 0

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
