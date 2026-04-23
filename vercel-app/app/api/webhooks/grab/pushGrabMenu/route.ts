import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'
import { reserveGrabWebhookEvent } from '@/lib/grab-webhook-idempotency'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Push Grab menu (온보딩 시 기존 Grab 메뉴를 POS로 내려줌)
 * 등록 예: https://<host>/api/webhooks/grab/pushGrabMenu
 */
export async function POST(req: NextRequest) {
  const denied = await grabWebhookUnauthorized(req, 'push_grab_menu')
  if (denied) return denied

  try {
    const raw = await req.text()
    const body = (() => {
      try {
        return JSON.parse(raw) as Record<string, unknown>
      } catch {
        return null
      }
    })()
    const merchantID = String(body?.merchantID ?? '')
    const partnerMerchantID = String(body?.partnerMerchantID ?? '')
    const payloadHash = createHash('sha256').update(raw).digest('hex').slice(0, 32)
    const dedupeKey = merchantID && partnerMerchantID
      ? `${merchantID}:${partnerMerchantID}:${payloadHash}`
      : payloadHash
    const duplicate = await reserveGrabWebhookEvent({
      eventKind: 'push_grab_menu',
      uniqueKey: dedupeKey,
      requestId: String(body?.requestID ?? ''),
      merchantId: merchantID,
      partnerMerchantId: partnerMerchantID,
      payload: body ?? { bodyBytes: raw.length },
    })
    if (duplicate) {
      logGrabWebhook('push_grab_menu', req, { bodyBytes: raw.length, duplicate: true })
      return new NextResponse(null, { status: 204 })
    }
    logGrabWebhook('push_grab_menu', req, { bodyBytes: raw.length, merchantID, partnerMerchantID })
  } catch {
    logGrabWebhook('push_grab_menu', req, { error: 'read_body_failed' })
  }
  // TODO: 페이로드 파싱 후 로컬 메뉴 임포트
  return new NextResponse(null, { status: 204 })
}
