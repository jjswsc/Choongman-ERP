import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'
import { releaseGrabWebhookEvent, reserveGrabWebhookEvent } from '@/lib/grab-webhook-idempotency'
import { syncGrabOrderStateToPos } from '@/lib/grab-order-to-pos'

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
  const dedupeKey = `${orderID}:${state}`
  if (!orderID || !state) {
    logGrabWebhook('push_order_state', req, { error: 'missing_orderID_or_state' })
    return new NextResponse(null, { status: 400 })
  }
  const duplicate = await reserveGrabWebhookEvent({
    eventKind: 'push_order_state',
    uniqueKey: dedupeKey,
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
  const synced = await syncGrabOrderStateToPos({
    orderID,
    state,
    orderPayload: body.order,
  })
  if (!synced.ok) {
    await releaseGrabWebhookEvent({
      eventKind: 'push_order_state',
      uniqueKey: dedupeKey,
    }).catch(() => {})
    logGrabWebhook('push_order_state', req, {
      orderID,
      merchantID: String(body.merchantID ?? ''),
      state,
      syncError: synced.message,
    })
    return NextResponse.json({ reason: 'sync_failed' }, { status: 500 })
  }

  logGrabWebhook('push_order_state', req, {
    orderID,
    merchantID: String(body.merchantID ?? ''),
    state,
    posOrderId: synced.orderId ?? null,
    posStatus: synced.status ?? null,
    updated: synced.updated,
    memoUpdated: synced.memoUpdated ?? false,
  })
  return new NextResponse(null, { status: 204 })
}
