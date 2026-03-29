import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'
import { supabaseInsertWithPgrst204Fallback } from '@/lib/supabase-pgrst204-retry'
import { applyLoyaltyOnOrder } from '@/lib/members-server'
import { computePosPricing } from '@/lib/pos-pricing'
import { coercePosOrderTypeForDb } from '@/lib/pos-sales-order-type-filter'
import { parseDeliveryAppCodeFromItemsJson } from '@/lib/pos-delivery-order-meta'
import { upsertTaxRecipientFromOrderMemo } from '@/lib/pos-tax-invoice-recipients-server'
import { allocateNextPosOrderNo } from '@/lib/pos-order-no-server'

const DELIVERY_PAYMENT_CHANNELS = new Set(['grab', 'lineman', 'shopee', 'dine_in'])
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
const idempotencyCache = new Map<string, { id: number; orderNo: string; at: number }>()

function readIdempotencyHit(key: string): { id: number; orderNo: string } | null {
  const hit = idempotencyCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > IDEMPOTENCY_TTL_MS) {
    idempotencyCache.delete(key)
    return null
  }
  return { id: hit.id, orderNo: hit.orderNo }
}

function writeIdempotencyHit(key: string, id: number, orderNo: string) {
  idempotencyCache.set(key, { id, orderNo, at: Date.now() })
}

function normalizeDeliveryPaymentChannel(raw: unknown, paymentDeliveryApp: number): string | null {
  if (paymentDeliveryApp <= 0.005) return null
  const s = String(raw ?? '').trim().toLowerCase()
  if (DELIVERY_PAYMENT_CHANNELS.has(s)) return s
  return 'grab'
}

/** POS 주문 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const idempotencyHeader = String(req.headers.get('x-idempotency-key') ?? '').trim()
    const idempotencyBody = String(body.localOrderNo ?? body.local_order_no ?? '').trim()
    const idempotencyKey = idempotencyHeader || idempotencyBody
    if (idempotencyKey) {
      const hit = readIdempotencyHit(idempotencyKey)
      if (hit) {
        return NextResponse.json(
          { success: true, orderId: hit.id, orderNo: hit.orderNo, duplicate: true },
          { headers }
        )
      }
    }
    const storeCode = String(body.storeCode ?? '').trim()
    const orderType = coercePosOrderTypeForDb(body.orderType ?? body.order_type)
    const tableName = String(body.tableName ?? '')
    const memo = String(body.memo ?? '').trim()
    const discountAmt = Math.max(0, Number(body.discountAmt ?? 0))
    const discountReason = String(body.discountReason ?? '').trim()
    const deliveryFee = Math.max(0, Number(body.deliveryFee ?? 0))
    const packagingFee = Math.max(0, Number(body.packagingFee ?? 0))
    const paymentCash = Math.max(0, Number(body.paymentCash ?? 0))
    const paymentCard = Math.max(0, Number(body.paymentCard ?? 0))
    const paymentQr = Math.max(0, Number(body.paymentQr ?? 0))
    const paymentOther = Math.max(0, Number(body.paymentOther ?? 0))
    const paymentDeliveryApp = Math.max(0, Number(body.paymentDeliveryApp ?? body.payment_delivery_app ?? 0))
    const deliveryPaymentChannel = normalizeDeliveryPaymentChannel(
      body.deliveryPaymentChannel ?? body.delivery_payment_channel,
      paymentDeliveryApp
    )
    const memberId = Math.max(0, Number(body.memberId ?? 0))
    const memberNo = String(body.memberNo ?? '').trim()
    const couponCode = String(body.couponCode ?? '').trim().toUpperCase()
    const couponDiscountAmt = Math.max(0, Number(body.couponDiscountAmt ?? 0))
    const pointUsed = Math.max(0, Math.trunc(Number(body.pointUsed ?? 0)))
    const pointEarnedReq = Math.max(0, Math.trunc(Number(body.pointEarned ?? 0)))
    const guestCountReq = Math.trunc(Number(body.guestCount ?? body.guest_count ?? 0))
    const items = Array.isArray(body.items) ? body.items : []
    const pricingAdjustments = body.pricingAdjustments || {}
    const createdBy = String(body.createdBy ?? body.created_by ?? '').trim()

    if (items.length === 0) {
      return NextResponse.json({ success: false, message: '주문 항목이 없습니다.' }, { headers })
    }

    let subtotal = 0
    for (const it of items) {
      const price = Number(it.price ?? 0)
      const qty = Number(it.qty ?? 1)
      subtotal += price * qty
    }
    const pricing = computePosPricing({
      subtotal,
      discountAmt,
      deliveryFee,
      packagingFee,
      cardPaymentAmount: paymentCard,
      adjustments: pricingAdjustments,
    })
    const vat = pricing.vatFeeAmt
    const total = pricing.finalTotal

    const guest_count =
      orderType === 'dine_in' ? Math.max(0, Math.min(99, guestCountReq)) : 0

    let delivery_app_code: string | null = null
    if (orderType === 'delivery') {
      let code = String(body.deliveryAppCode ?? body.delivery_app_code ?? '')
        .trim()
        .toLowerCase()
      if (!code) {
        for (const it of items) {
          const c = String((it as { deliveryAppCode?: string }).deliveryAppCode ?? '')
            .trim()
            .toLowerCase()
          if (c) {
            code = c
            break
          }
        }
      }
      if (!code) {
        code = parseDeliveryAppCodeFromItemsJson(JSON.stringify(items))
      }
      delivery_app_code = code || null
    }

    const orderNo = await allocateNextPosOrderNo(storeCode)
    const row = {
      order_no: orderNo,
      store_code: storeCode,
      order_type: orderType,
      table_name: tableName,
      memo,
      discount_amt: discountAmt,
      discount_reason: discountReason,
      delivery_fee: deliveryFee,
      packaging_fee: packagingFee,
      items_json: JSON.stringify(items),
      subtotal,
      vat,
      total,
      status: 'pending',
      payment_cash: paymentCash,
      payment_card: paymentCard,
      payment_qr: paymentQr,
      payment_other: paymentOther,
      payment_delivery_app: paymentDeliveryApp,
      delivery_payment_channel: deliveryPaymentChannel,
      member_id: memberId || null,
      member_no: memberNo || null,
      coupon_code: couponCode || null,
      coupon_discount_amt: couponDiscountAmt,
      point_used: pointUsed,
      point_earned: pointEarnedReq,
      guest_count,
      delivery_app_code,
      created_by: createdBy,
    }
    const inserted = (await supabaseInsertWithPgrst204Fallback(
      'pos_orders',
      row,
      'savePosOrder'
    )) as { id?: number }[]
    const created = Array.isArray(inserted) ? inserted[0] : inserted
    if (idempotencyKey && Number(created?.id) > 0) {
      writeIdempotencyHit(idempotencyKey, Number(created.id), orderNo)
    }

    const paymentSum = paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryApp
    let pointEarned = pointEarnedReq
    if (memberId > 0 && paymentSum > 0 && created?.id) {
      const loyalty = await applyLoyaltyOnOrder({
        memberId,
        orderId: Number(created.id),
        totalAmount: total,
        pointUsed,
        pointEarned: pointEarnedReq,
        orderNo,
        couponCode,
      })
      pointEarned = loyalty.pointEarned
      await supabaseUpdateByFilter('pos_orders', `id=eq.${Number(created.id)}`, {
        point_earned: pointEarned,
      })
    }

    try {
      await upsertTaxRecipientFromOrderMemo(storeCode, memo, 'pos_order_memo')
    } catch (taxErr) {
      console.error('savePosOrder tax recipient upsert:', taxErr)
    }

    return NextResponse.json({
      success: true,
      orderId: created?.id,
      orderNo,
      pointEarned,
    }, { headers })
  } catch (e) {
    console.error('savePosOrder:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
