import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Push store integration status
 * 등록 예: https://<host>/api/webhooks/grab/pushIntegrationStatus
 */
export async function POST(req: NextRequest) {
  const denied = grabWebhookUnauthorized(req, 'push_integration_status')
  if (denied) return denied

  try {
    const body = (await req.json()) as Record<string, unknown>
    logGrabWebhook('push_integration_status', req, {
      partnerMerchantID: String(body.partnerMerchantID ?? ''),
      grabMerchantID: String(body.grabMerchantID ?? ''),
      integrationStatus: String(body.integrationStatus ?? ''),
    })
  } catch {
    logGrabWebhook('push_integration_status', req, { error: 'invalid_json' })
    return new NextResponse(null, { status: 400 })
  }
  return new NextResponse(null, { status: 204 })
}
