import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'
import { reserveGrabWebhookEvent } from '@/lib/grab-webhook-idempotency'

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
  const duplicate = await reserveGrabWebhookEvent({
    eventKind: 'submit_order',
    uniqueKey: orderID,
    requestId: String(body.requestID ?? ''),
    orderId: orderID,
    merchantId: merchantID,
    partnerMerchantId: String(body.partnerMerchantID ?? ''),
    payload: body,
  })
  if (duplicate) {
    logGrabWebhook('submit_order', req, { orderID, duplicate: true })
    return new NextResponse(null, { status: 204 })
  }
  logGrabWebhook('submit_order', req, {
    orderID,
    shortOrderNumber,
    merchantID,
    partnerMerchantID: String(body.partnerMerchantID ?? ''),
  })
  // TODO: idempotent 저장 후 POS 반영 (동일 orderID 재전송 대비)
  return new NextResponse(null, { status: 204 })
}
