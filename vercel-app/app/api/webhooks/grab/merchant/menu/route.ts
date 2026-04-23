import { NextRequest, NextResponse } from 'next/server'
import { grabStubMenuJson, grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Get food menu
 * 등록 예: https://<host>/api/webhooks/grab/merchant/menu
 */
export async function GET(req: NextRequest) {
  const denied = await grabWebhookUnauthorized(req, 'get_menu')
  if (denied) return denied

  const url = new URL(req.url)
  const merchantID = url.searchParams.get('merchantID')?.trim() ?? ''
  const partnerMerchantID = url.searchParams.get('partnerMerchantID')?.trim() ?? ''
  if (!merchantID || !partnerMerchantID) {
    logGrabWebhook('get_menu', req, { error: 'missing_query' })
    return NextResponse.json(
      { reason: 'invalid_argument', message: 'merchantID and partnerMerchantID are required' },
      { status: 400 }
    )
  }
  logGrabWebhook('get_menu', req, { merchantID, partnerMerchantID })
  return NextResponse.json(grabStubMenuJson(merchantID, partnerMerchantID))
}
