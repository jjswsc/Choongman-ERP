import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'
import { releaseGrabWebhookEvent, reserveGrabWebhookEvent } from '@/lib/grab-webhook-idempotency'
import { syncGrabOrderStateToPos } from '@/lib/grab-order-to-pos'
import { grabListOrdersByIds } from '@/lib/grab-partner-api'

export const dynamic = 'force-dynamic'

function shouldFailOpenOnStateSyncError(message: string): boolean {
  const msg = String(message || '').trim().toLowerCase()
  return (
    msg === 'pos_order_not_found' ||
    msg.startsWith('order_not_found_and_create_failed:') ||
    msg.includes('no line items')
  )
}

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

  try {
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
    const merchantID = String(body.merchantID ?? '').trim()
    let orderPayload = body.order
    if (!orderPayload && merchantID) {
      try {
        const listed = await grabListOrdersByIds({ merchantID, orderIDs: [orderID] })
        const fetched = (listed?.orders || []).find((o) => String(o.orderID || '').trim() === orderID)
        if (fetched) orderPayload = fetched
      } catch (e) {
        logGrabWebhook('push_order_state', req, {
          orderID,
          merchantID,
          state,
          listOrdersPrefetchError: String(e ?? 'unknown'),
        })
      }
    }

    const synced = await syncGrabOrderStateToPos({
      orderID,
      state,
      orderPayload,
    })
    if (!synced.ok) {
      await releaseGrabWebhookEvent({
        eventKind: 'push_order_state',
        uniqueKey: dedupeKey,
      }).catch(() => {})
      if (shouldFailOpenOnStateSyncError(synced.message)) {
        logGrabWebhook('push_order_state', req, {
          orderID,
          merchantID,
          state,
          syncIgnored: synced.message,
        })
        return new NextResponse(null, { status: 204 })
      }
      logGrabWebhook('push_order_state', req, {
        orderID,
        merchantID,
        state,
        syncError: synced.message,
      })
      return NextResponse.json({ reason: 'sync_failed', message: synced.message }, { status: 500 })
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
  } catch (e) {
    logGrabWebhook('push_order_state', req, {
      orderID,
      merchantID: String(body.merchantID ?? ''),
      state,
      error: String(e ?? 'unknown'),
    })
    return NextResponse.json({ reason: 'internal_error', message: String(e ?? 'unknown') }, { status: 500 })
  }
}
