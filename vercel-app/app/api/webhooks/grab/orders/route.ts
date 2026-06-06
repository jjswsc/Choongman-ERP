import { NextRequest, NextResponse } from 'next/server'
import { grabWebhookUnauthorized, logGrabWebhook } from '@/lib/grab-webhook'
import { reserveGrabWebhookEvent } from '@/lib/grab-webhook-idempotency'
import { persistGrabOrderToPos, resolveGrabStoreCode } from '@/lib/grab-order-to-pos'
import { grabListOrdersByIds, grabPrepareOrder } from '@/lib/grab-partner-api'
import { getPosDeliveryPolicyBundle, resolveOrderAcceptanceMode } from '@/lib/pos-delivery-policy'
import { enqueueKitchenPrintJob } from '@/lib/pos-print-job-queue'
import { buildKitchenJobInboundDedupeKey } from '@/lib/pos-kitchen-print-dedupe-key'

export const dynamic = 'force-dynamic'

/**
 * Grab → 파트너: Submit order
 * 등록 예: https://<host>/api/webhooks/grab/orders
 */
export async function POST(req: NextRequest) {
  const denied = await grabWebhookUnauthorized(req, 'submit_order')
  if (denied) return denied

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    logGrabWebhook('submit_order', req, { error: 'invalid_json' })
    return new NextResponse(null, { status: 400 })
  }
  const orderID = String(body.orderID ?? '')
  const shortOrderNumber = String(body.shortOrderNumber ?? '')
  const merchantID = String(body.merchantID ?? '')
  const resolvedStoreCode = resolveGrabStoreCode(body)
  if (!orderID) {
    logGrabWebhook('submit_order', req, { error: 'missing_orderID' })
    return new NextResponse(null, { status: 400 })
  }
  /** 매장별 `pos_delivery_app_policies`: manual → pending(수락 필요), auto → cooking(자동 수락) */
  const policyBundle = resolvedStoreCode
    ? await getPosDeliveryPolicyBundle({ storeCode: resolvedStoreCode, appCode: 'grab' }).catch(() => null)
    : null
  const acceptanceMode = resolveOrderAcceptanceMode(policyBundle)
  const initialStatus = acceptanceMode === 'auto' ? 'cooking' : 'pending'
  let orderPayload: Record<string, unknown> = body
  if (merchantID) {
    try {
      const listed = await grabListOrdersByIds({ merchantID, orderIDs: [orderID] })
      const fullOrder = (listed?.orders || []).find((o) => String(o.orderID || '').trim() === orderID)
      if (fullOrder) {
        const fullItems = (fullOrder as { items?: unknown }).items
        if (Array.isArray(fullItems) && fullItems.length > 0) {
          orderPayload = fullOrder as Record<string, unknown>
        }
      }
    } catch (e) {
      logGrabWebhook('submit_order', req, {
        orderID,
        merchantID,
        listOrdersPrefetchError: String(e ?? 'unknown'),
      })
    }
  }
  let persisted = await persistGrabOrderToPos(orderPayload, { initialStatus })
  const firstPersistError = persisted.ok ? '' : String(persisted.message || '')
  // 일부 매장에서 submit_order payload에 items가 누락되어 no line items로 실패하는 케이스 폴백
  if (!persisted.ok && firstPersistError === 'no line items' && merchantID) {
    try {
      const listed = await grabListOrdersByIds({ merchantID, orderIDs: [orderID] })
      const fullOrder = (listed?.orders || []).find((o) => String(o.orderID || '').trim() === orderID)
      if (fullOrder) {
        persisted = await persistGrabOrderToPos(fullOrder as Record<string, unknown>, { initialStatus })
      }
    } catch (e) {
      logGrabWebhook('submit_order', req, {
        orderID,
        merchantID,
        resolvedStoreCode,
        partnerMerchantID: String(body.partnerMerchantID ?? ''),
        persistError: firstPersistError,
        fallbackListOrdersError: String(e ?? 'unknown'),
      })
    }
  }
  if (!persisted.ok) {
    logGrabWebhook('submit_order', req, {
      orderID,
      merchantID,
      resolvedStoreCode,
      partnerMerchantID: String(body.partnerMerchantID ?? ''),
      persistError: persisted.message,
    })
    return NextResponse.json({ reason: 'persist_failed' }, { status: 500 })
  }

  if (persisted.storeCode && persisted.orderId) {
    try {
      await enqueueKitchenPrintJob({
        storeCode: persisted.storeCode,
        orderId: persisted.orderId,
        orderNo: persisted.orderNo,
        source: 'grab_submit_order',
        dedupeKey: buildKitchenJobInboundDedupeKey(persisted.orderId),
        payload: {
          action: 'inbound_delivery',
          acceptanceMode,
          initialStatus,
        },
      })
    } catch (e) {
      logGrabWebhook('submit_order', req, {
        orderID,
        kitchenPrintEnqueueError: String(e ?? 'unknown'),
      })
    }
  }

  if (acceptanceMode === 'auto' && !persisted.duplicate) {
    try {
      await grabPrepareOrder({ orderID, toState: 'Accepted' })
    } catch (e) {
      logGrabWebhook('submit_order', req, {
        orderID,
        grabPrepareError: String(e ?? 'unknown'),
      })
    }
  }

  logGrabWebhook('submit_order', req, {
    orderID,
    shortOrderNumber,
    merchantID,
    resolvedStoreCode,
    partnerMerchantID: String(body.partnerMerchantID ?? ''),
    posOrderId: persisted.orderId,
    posOrderNo: persisted.orderNo,
    duplicate: persisted.duplicate,
    acceptanceMode,
    initialStatus,
  })

  // Audit trail only (idempotency는 POS 저장 로직에서도 memo 기반으로 보강)
  try {
    await reserveGrabWebhookEvent({
      eventKind: 'submit_order',
      uniqueKey: orderID,
      requestId: String(body.requestID ?? ''),
      orderId: orderID,
      merchantId: merchantID,
      partnerMerchantId: String(body.partnerMerchantID ?? ''),
      payload: body,
    })
  } catch (e) {
    console.warn('[grab-webhook] submit_order audit_write_failed', String(e ?? 'unknown'))
  }

  return new NextResponse(null, { status: 204 })
}
