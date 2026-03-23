import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Push Grab menu (온보딩 시 기존 Grab 메뉴를 POS로 내려줌)
 * 등록 예: https://<host>/api/webhooks/grab/pushGrabMenu
 */
export async function POST(req: NextRequest) {
  const denied = grabWebhookUnauthorized(req, 'push_grab_menu')
  if (denied) return denied

  try {
    const raw = await req.text()
    logGrabWebhook('push_grab_menu', req, { bodyBytes: raw.length })
  } catch {
    logGrabWebhook('push_grab_menu', req, { error: 'read_body_failed' })
  }
  // TODO: 페이로드 파싱 후 로컬 메뉴 임포트
  return new NextResponse(null, { status: 204 })
}
