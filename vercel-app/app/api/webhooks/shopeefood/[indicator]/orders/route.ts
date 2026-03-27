import { NextRequest } from 'next/server'
import {
  logShopeeFoodWebhook,
  shopeeFoodBearerUnauthorized,
  shopeeFoodIndicatorDenied,
  shopeeFoodVendorAckJson,
} from '@/lib/shopeefood-webhook'
import { persistShopeeFoodOrderToPos } from '@/lib/shopeefood-order-to-pos'

export const dynamic = 'force-dynamic'

/**
 * ShopeeFood → 벤더: 주문 전달 (Submit Order To Vendor)
 * 등록 URL 예: https://&lt;host&gt;/api/webhooks/shopeefood/&lt;indicator&gt;/orders
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ indicator: string }> }
) {
  const { indicator } = await context.params
  const indDenied = shopeeFoodIndicatorDenied(req, indicator)
  if (indDenied) return indDenied
  const auth = shopeeFoodBearerUnauthorized(req, 'submit_order', indicator)
  if (auth) return auth

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    logShopeeFoodWebhook('submit_order', req, indicator, { error: 'invalid_json' })
    return shopeeFoodVendorAckJson(1000, 'invalid_json')
  }

  const orderId = String(body.id ?? '')
  const storeId = String(body.store_id ?? '')
  logShopeeFoodWebhook('submit_order', req, indicator, {
    orderId,
    storeId,
    status: String(body.status ?? ''),
    shortCode: String(body.order_short_code ?? ''),
  })

  const persisted = await persistShopeeFoodOrderToPos({
    order: body,
    indicator,
    reqPath: req.nextUrl.pathname,
  })

  if (!persisted.ok) {
    console.error('[shopeefood-webhook] order_persist_failed', persisted.message)
    return shopeeFoodVendorAckJson(1000, persisted.message)
  }

  return shopeeFoodVendorAckJson(0, 'success')
}
