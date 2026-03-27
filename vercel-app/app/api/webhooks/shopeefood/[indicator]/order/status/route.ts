import { NextRequest } from 'next/server'
import {
  logShopeeFoodWebhook,
  shopeeFoodBearerUnauthorized,
  shopeeFoodIndicatorDenied,
  shopeeFoodVendorAckJson,
} from '@/lib/shopeefood-webhook'

export const dynamic = 'force-dynamic'

/**
 * ShopeeFood → 벤더: 주문 상태 변경 푸시
 * 등록 URL 예: .../order/status
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ indicator: string }> }
) {
  const { indicator } = await context.params
  const indDenied = shopeeFoodIndicatorDenied(req, indicator)
  if (indDenied) return indDenied
  const auth = shopeeFoodBearerUnauthorized(req, 'order_status', indicator)
  if (auth) return auth

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return shopeeFoodVendorAckJson(1000, 'invalid_json')
  }

  logShopeeFoodWebhook('order_status', req, indicator, {
    id: String(body.id ?? ''),
    store_id: String(body.store_id ?? ''),
    status: String(body.status ?? ''),
  })

  // TODO: pos_orders 상태·취소 동기화 (필요 시 Shopee 상태 ↔ POS status 매핑)
  return shopeeFoodVendorAckJson(0, 'success')
}
