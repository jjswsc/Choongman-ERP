import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'
import { reserveGrabWebhookEvent } from '@/lib/grab-webhook-idempotency'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Push store integration status
 * 등록 예: https://<host>/api/webhooks/grab/pushIntegrationStatus
 */
export async function POST(req: NextRequest) {
  const denied = await grabWebhookUnauthorized(req, 'push_integration_status')
  if (denied) return denied

  try {
    const body = (await req.json()) as Record<string, unknown>
    const partnerMerchantID = String(body.partnerMerchantID ?? '')
    const grabMerchantID = String(body.grabMerchantID ?? '')
    const integrationStatus = String(body.integrationStatus ?? '')
    if (!partnerMerchantID || !grabMerchantID || !integrationStatus) {
      logGrabWebhook('push_integration_status', req, { error: 'missing_required_fields' })
      return new NextResponse(null, { status: 400 })
    }
    const duplicate = await reserveGrabWebhookEvent({
      eventKind: 'push_integration_status',
      uniqueKey: `${grabMerchantID}:${integrationStatus}`,
      requestId: String(body.requestID ?? ''),
      merchantId: grabMerchantID,
      partnerMerchantId: partnerMerchantID,
      payload: body,
    })
    if (duplicate) {
      logGrabWebhook('push_integration_status', req, {
        partnerMerchantID,
        grabMerchantID,
        integrationStatus,
        duplicate: true,
      })
      return new NextResponse(null, { status: 204 })
    }
    logGrabWebhook('push_integration_status', req, {
      partnerMerchantID,
      grabMerchantID,
      integrationStatus,
    })
  } catch {
    logGrabWebhook('push_integration_status', req, { error: 'invalid_json' })
    return new NextResponse(null, { status: 400 })
  }
  return new NextResponse(null, { status: 204 })
}
