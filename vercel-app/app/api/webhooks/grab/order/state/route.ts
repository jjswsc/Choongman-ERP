import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'
import { reserveGrabWebhookEvent } from '@/lib/grab-webhook-idempotency'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Push order state
 * 등록 예: https://<host>/api/webhooks/grab/order/state
 */
export async function PUT(req: NextRequest) {
  const denied = await grabWebhookUnauthorized(req, 'push_order_state')
  if (denied) return denied

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    logGrabWebhook('push_order_state', req, { error: 'invalid_json' })
    return new NextResponse(null, { status: 400 })
  }
  const orderID = String(body.orderID ?? '')
  const state = String(body.state ?? '')
  if (!orderID || !state) {
    logGrabWebhook('push_order_state', req, { error: 'missing_orderID_or_state' })
    return new NextResponse(null, { status: 400 })
  }
  const duplicate = await reserveGrabWebhookEvent({
    eventKind: 'push_order_state',
    uniqueKey: `${orderID}:${state}`,
    requestId: String(body.requestID ?? ''),
    orderId: orderID,
    merchantId: String(body.merchantID ?? ''),
    partnerMerchantId: String(body.partnerMerchantID ?? ''),
    payload: body,
  })
  if (duplicate) {
    logGrabWebhook('push_order_state', req, { orderID, state, duplicate: true })
    return new NextResponse(null, { status: 204 })
  }
  logGrabWebhook('push_order_state', req, {
    orderID,
    merchantID: String(body.merchantID ?? ''),
    state,
  })
  // TODO: 주문 상태 동기화
  return new NextResponse(null, { status: 204 })
}
