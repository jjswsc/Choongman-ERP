import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Push order state
 * 등록 예: https://<host>/api/webhooks/grab/order/state
 */
export async function PUT(req: NextRequest) {
  const denied = grabWebhookUnauthorized(req, 'push_order_state')
  if (denied) return denied

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    logGrabWebhook('push_order_state', req, { error: 'invalid_json' })
    return new NextResponse(null, { status: 400 })
  }
  logGrabWebhook('push_order_state', req, {
    orderID: String(body.orderID ?? ''),
    merchantID: String(body.merchantID ?? ''),
    state: String(body.state ?? ''),
  })
  // TODO: 주문 상태 동기화
  return new NextResponse(null, { status: 204 })
}
