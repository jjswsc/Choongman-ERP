import { NextRequest, NextResponse } from 'next/server'
import { syncGrabPromoTargetPriceCampaigns } from '@/lib/grab-promo-target-price-campaign'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'
import { reserveGrabWebhookEvent } from '@/lib/grab-webhook-idempotency'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Menu sync state (문서상 path는 프로젝트 설정에 맞게 임의)
 * 등록 예: https://<host>/api/webhooks/grab/menu-sync-state
 */
export async function POST(req: NextRequest) {
  const denied = await grabWebhookUnauthorized(req, 'menu_sync_state')
  if (denied) return denied

  try {
    const body = (await req.json()) as Record<string, unknown>
    const requestID = String(body.requestID ?? '')
    const jobID = String(body.jobID ?? '')
    const dedupeKey = requestID || jobID
    if (!dedupeKey) {
      logGrabWebhook('menu_sync_state', req, { error: 'missing_requestID_and_jobID' })
      return new NextResponse(null, { status: 400 })
    }
    const duplicate = await reserveGrabWebhookEvent({
      eventKind: 'menu_sync_state',
      uniqueKey: dedupeKey,
      requestId: requestID,
      jobId: jobID,
      merchantId: String(body.merchantID ?? ''),
      partnerMerchantId: String(body.partnerMerchantID ?? ''),
      payload: body,
    })
    if (duplicate) {
      logGrabWebhook('menu_sync_state', req, { requestID, jobID, duplicate: true })
      return new NextResponse(null, { status: 204 })
    }
    const merchantID = String(body.merchantID ?? '').trim()
    const status = String(body.status ?? '').trim().toUpperCase()
    logGrabWebhook('menu_sync_state', req, {
      requestID,
      jobID,
      merchantID,
      status,
    })
    if (status === 'SUCCESS' && merchantID) {
      void syncGrabPromoTargetPriceCampaigns({ merchantID })
        .then((r) => {
          console.info('[grab-menu-sync] promo_target_price_campaigns', {
            merchantID,
            requestID,
            jobID,
            ...r,
          })
        })
        .catch((e) => {
          console.warn('[grab-menu-sync] promo_target_price_campaigns_failed', {
            merchantID,
            requestID,
            jobID,
            error: String(e),
          })
        })
    }
  } catch {
    logGrabWebhook('menu_sync_state', req, { error: 'invalid_json' })
    return new NextResponse(null, { status: 400 })
  }
  return new NextResponse(null, { status: 204 })
}
