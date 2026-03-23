import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Menu sync state (문서상 path는 프로젝트 설정에 맞게 임의)
 * 등록 예: https://<host>/api/webhooks/grab/menu-sync-state
 */
export async function POST(req: NextRequest) {
  const denied = grabWebhookUnauthorized(req, 'menu_sync_state')
  if (denied) return denied

  try {
    const body = (await req.json()) as Record<string, unknown>
    logGrabWebhook('menu_sync_state', req, {
      requestID: String(body.requestID ?? ''),
      jobID: String(body.jobID ?? ''),
      merchantID: String(body.merchantID ?? ''),
      status: String(body.status ?? ''),
    })
  } catch {
    logGrabWebhook('menu_sync_state', req, { error: 'invalid_json' })
    return new NextResponse(null, { status: 400 })
  }
  return new NextResponse(null, { status: 204 })
}
