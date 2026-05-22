import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'
import { releaseGrabWebhookEvent, reserveGrabWebhookEvent } from '@/lib/grab-webhook-idempotency'
import { upsertGrabStoreIntegration } from '@/lib/grab-store-integration'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Push store integration status
 * 등록 예: https://<host>/api/webhooks/grab/pushIntegrationStatus
 */
export async function POST(req: NextRequest) {
  const denied = await grabWebhookUnauthorized(req, 'push_integration_status')
  if (denied) return denied

  let reservedEvent: { eventKind: string; uniqueKey: string } | null = null
  try {
    const body = (await req.json()) as Record<string, unknown>
    const partnerMerchantID = String(body.partnerMerchantID ?? '')
    const grabMerchantID = String(body.grabMerchantID ?? '')
    const integrationStatus = String(body.integrationStatus ?? '')
    if (!partnerMerchantID || !grabMerchantID || !integrationStatus) {
      logGrabWebhook('push_integration_status', req, { error: 'missing_required_fields' })
      return new NextResponse(null, { status: 400 })
    }
    const dedupeKey = `${grabMerchantID}:${integrationStatus}`
    const duplicate = await reserveGrabWebhookEvent({
      eventKind: 'push_integration_status',
      uniqueKey: dedupeKey,
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
    reservedEvent = { eventKind: 'push_integration_status', uniqueKey: dedupeKey }

    const persisted = await upsertGrabStoreIntegration({
      grabMerchantID,
      partnerMerchantID,
      integrationStatus,
      requestID: String(body.requestID ?? ''),
      message: String(body.message ?? ''),
      payload: body,
    })

    logGrabWebhook('push_integration_status', req, {
      partnerMerchantID,
      grabMerchantID,
      integrationStatus,
      created: persisted.created,
    })
  } catch (e) {
    if (reservedEvent) {
      await releaseGrabWebhookEvent(reservedEvent).catch(() => {})
    }
    const msg = String(e ?? '')
    if (/unexpected token|invalid json|json/i.test(msg)) {
      logGrabWebhook('push_integration_status', req, { error: 'invalid_json' })
      return new NextResponse(null, { status: 400 })
    }
    if (/pos_grab_store_integrations|does not exist|42p01/i.test(msg)) {
      logGrabWebhook('push_integration_status', req, {
        warning: 'missing_pos_grab_store_integrations_table',
      })
      return new NextResponse(null, { status: 204 })
    }
    logGrabWebhook('push_integration_status', req, { error: 'persist_failed', message: msg })
    return NextResponse.json({ reason: 'persist_failed' }, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}
