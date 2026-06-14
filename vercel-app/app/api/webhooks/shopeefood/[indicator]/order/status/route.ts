import { NextRequest } from 'next/server'
import {
  logShopeeFoodWebhook,
  shopeeFoodBearerUnauthorized,
  shopeeFoodIndicatorDenied,
  shopeeFoodVendorAckJson,
} from '@/lib/shopeefood-webhook'
import { syncShopeeFoodOrderStatusToPos } from '@/lib/shopeefood-order-status-sync'

export const dynamic = 'force-dynamic'

function shouldFailOpenOnStatusSyncError(message: string): boolean {
  const msg = String(message || '').trim().toLowerCase()
  return msg === 'pos_order_not_found'
}

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

  const orderId = String(body.id ?? '')
  const storeId = String(body.store_id ?? '')
  const status = String(body.status ?? '')

  logShopeeFoodWebhook('order_status', req, indicator, {
    id: orderId,
    store_id: storeId,
    status,
  })

  if (!orderId || !status) {
    return shopeeFoodVendorAckJson(1000, 'missing id or status')
  }

  const synced = await syncShopeeFoodOrderStatusToPos({
    orderId,
    status,
    storeId,
    indicator,
  })

  if (!synced.ok) {
    if (shouldFailOpenOnStatusSyncError(synced.message)) {
      logShopeeFoodWebhook('order_status', req, indicator, {
        id: orderId,
        store_id: storeId,
        status,
        syncIgnored: synced.message,
      })
      return shopeeFoodVendorAckJson(0, 'success')
    }
    console.error('[shopeefood-webhook] order_status_sync_failed', synced.message)
    return shopeeFoodVendorAckJson(1000, synced.message)
  }

  logShopeeFoodWebhook('order_status', req, indicator, {
    id: orderId,
    store_id: storeId,
    status,
    posOrderId: synced.orderId ?? null,
    posStatus: synced.status ?? null,
    updated: synced.updated,
  })

  return shopeeFoodVendorAckJson(0, 'success')
}
