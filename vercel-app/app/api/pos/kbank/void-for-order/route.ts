import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import {
  executeConfirmedKbankVoidForOrder,
  inquireKbankVoidForOrderOnce,
  loadKbankVoidOrderContext,
  messageForReason,
  previewFromContext,
  tryLockKbankVoidForOrder,
  unlockKbankVoidForOrder,
} from '@/lib/payments/kbank-void-for-order-server'
import { kbankVoidReasonToStatusCode } from '@/lib/payments/kbank-void-from-order'

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
  const auth = authResult.auth

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const orderId = Math.floor(Number(body.orderId || body.serverOrderId || 0))
    const confirm = body.confirm === true || body.confirm === 'true' || body.confirm === 1

    if (!Number.isFinite(orderId) || orderId <= 0) {
      return withCorsHeaders(
        NextResponse.json(
          { success: false, statusCode: 'KBANK_VOID_ORDER_REQUIRED', message: 'orderId is required.' },
          { status: 400 }
        )
      )
    }

    if (!tryLockKbankVoidForOrder(orderId)) {
      return withCorsHeaders(
        NextResponse.json(
          {
            success: false,
            statusCode: 'KBANK_VOID_IN_PROGRESS',
            message: 'A Void request for this bill is already in progress.',
          },
          { status: 409 }
        )
      )
    }

    try {
      const loaded = await loadKbankVoidOrderContext(orderId, auth)
      if (!loaded.ok) {
        return withCorsHeaders(
          NextResponse.json(
            {
              success: false,
              statusCode: loaded.code,
              message: loaded.message,
              preview: loaded.preview || null,
            },
            { status: loaded.httpStatus }
          )
        )
      }

      const inquired = await inquireKbankVoidForOrderOnce(loaded.ctx, auth)
      if (!inquired.ok) {
        return withCorsHeaders(
          NextResponse.json(
            {
              success: false,
              statusCode: inquired.code,
              message: inquired.message,
              preview: inquired.preview || previewFromContext(loaded.ctx),
            },
            { status: inquired.httpStatus }
          )
        )
      }

      const preview = previewFromContext(inquired.ctx)
      if (!confirm) {
        const blocked = !preview.canVoid && !preview.alreadyVoided
        return withCorsHeaders(
          NextResponse.json(
            {
              success: !blocked,
              preview,
              alreadyVoided: preview.alreadyVoided,
              statusCode: preview.canVoid
                ? 'KBANK_VOID_PREVIEW'
                : kbankVoidReasonToStatusCode(preview.reason),
              message: preview.canVoid ? undefined : messageForReason(preview.reason),
              orderId,
            },
            { status: preview.alreadyVoided || preview.canVoid ? 200 : 422 }
          )
        )
      }

      const executed = await executeConfirmedKbankVoidForOrder(inquired.ctx, auth)
      if (!executed.ok) {
        return withCorsHeaders(
          NextResponse.json(
            {
              success: false,
              statusCode: executed.code,
              message: executed.message,
              preview: executed.preview || preview,
              orderId,
            },
            { status: executed.httpStatus }
          )
        )
      }

      return withCorsHeaders(
        NextResponse.json({
          success: true,
          alreadyVoided: Boolean(executed.alreadyVoided),
          preview: executed.preview,
          partnerTransactionId: executed.partnerTransactionId,
          origPartnerTxnUid: executed.origPartnerTxnUid,
          txnNo: executed.txnNo,
          orderId,
          storeCode: inquired.ctx.storeCode,
          statusCode: executed.statusCode || null,
          statusMessage: executed.statusMessage || null,
          data: executed.data,
        })
      )
    } finally {
      unlockKbankVoidForOrder(orderId)
    }
  } catch (e) {
    console.error('pos/kbank/void-for-order:', e)
    return withCorsHeaders(
      NextResponse.json(
        { success: false, message: e instanceof Error ? e.message : 'kbank_void_for_order_error' },
        { status: 500 }
      )
    )
  }
}
