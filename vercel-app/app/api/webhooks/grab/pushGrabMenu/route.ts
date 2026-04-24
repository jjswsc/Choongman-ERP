import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'
import { reserveGrabWebhookEvent } from '@/lib/grab-webhook-idempotency'
import { importGrabMenuToPos } from '@/lib/grab-menu-import-to-pos'

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
    let imported: { menusUpserted: number; optionsUpserted: number; skipped: number } | null = null
    if (body) {
      imported = await importGrabMenuToPos(body)
    }
    logGrabWebhook('push_grab_menu', req, {
      bodyBytes: raw.length,
      merchantID,
      partnerMerchantID,
      menusUpserted: imported?.menusUpserted ?? 0,
      optionsUpserted: imported?.optionsUpserted ?? 0,
      skipped: imported?.skipped ?? 0,
    })
    if (!body) {
      return NextResponse.json({ reason: 'invalid_json' }, { status: 400 })
    }
  } catch (e) {
    logGrabWebhook('push_grab_menu', req, { error: 'import_failed', message: String(e ?? 'unknown') })
    return NextResponse.json({ reason: 'import_failed' }, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}
