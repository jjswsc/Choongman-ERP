import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'
import { reserveGrabWebhookEvent } from '@/lib/grab-webhook-idempotency'
import { persistGrabOrderToPos } from '@/lib/grab-order-to-pos'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Submit order
 * 등록 예: https://<host>/api/webhooks/grab/orders
 */
export async function POST(req: NextRequest) {
  const denied = await grabWebhookUnauthorized(req, 'submit_order')
  if (denied) return denied

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    logGrabWebhook('submit_order', req, { error: 'invalid_json' })
    return new NextResponse(null, { status: 400 })
  }
  const orderID = String(body.orderID ?? '')
  const shortOrderNumber = String(body.shortOrderNumber ?? '')
  const merchantID = String(body.merchantID ?? '')
  if (!orderID) {
    logGrabWebhook('submit_order', req, { error: 'missing_orderID' })
    return new NextResponse(null, { status: 400 })
  }
  const persisted = await persistGrabOrderToPos(body)
  if (!persisted.ok) {
    logGrabWebhook('submit_order', req, {
      orderID,
      merchantID,
      partnerMerchantID: String(body.partnerMerchantID ?? ''),
      persistError: persisted.message,
    })
    return NextResponse.json({ reason: 'persist_failed' }, { status: 500 })
  }

  logGrabWebhook('submit_order', req, {
    orderID,
    shortOrderNumber,
    merchantID,
    partnerMerchantID: String(body.partnerMerchantID ?? ''),
    posOrderId: persisted.orderId,
    posOrderNo: persisted.orderNo,
    duplicate: persisted.duplicate,
  })

  // Audit trail only (idempotency는 POS 저장 로직에서도 memo 기반으로 보강)
  try {
    await reserveGrabWebhookEvent({
      eventKind: 'submit_order',
      uniqueKey: orderID,
      requestId: String(body.requestID ?? ''),
      orderId: orderID,
      merchantId: merchantID,
      partnerMerchantId: String(body.partnerMerchantID ?? ''),
      payload: body,
    })
  } catch (e) {
    console.warn('[grab-webhook] submit_order audit_write_failed', String(e ?? 'unknown'))
  }

  return new NextResponse(null, { status: 204 })
}
