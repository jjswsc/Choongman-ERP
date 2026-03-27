import { NextRequest } from 'next/server'
import {
  logShopeeFoodWebhook,
  shopeeFoodBearerUnauthorized,
  shopeeFoodIndicatorDenied,
  shopeeFoodVendorAckJson,
} from '@/lib/shopeefood-webhook'

export const dynamic = 'force-dynamic'

/**
 * ShopeeFood → 벤더: 메뉴 동기화 결과 콜백
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ indicator: string }> }
) {
  const { indicator } = await context.params
  const indDenied = shopeeFoodIndicatorDenied(req, indicator)
  if (indDenied) return indDenied
  const auth = shopeeFoodBearerUnauthorized(req, 'menu_notification_result', indicator)
  if (auth) return auth

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return shopeeFoodVendorAckJson(1000, 'invalid_json')
  }

  logShopeeFoodWebhook('menu_notification_result', req, indicator, {
    store_id: String(body.store_id ?? ''),
    result: body.result,
    msg: String(body.msg ?? ''),
  })

  return shopeeFoodVendorAckJson(0, 'success')
}
