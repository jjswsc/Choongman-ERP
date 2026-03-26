import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { applyLoyaltyOnOrder } from '@/lib/members-server'
import { computePosPricing } from '@/lib/pos-pricing'
import { coercePosOrderTypeForDb } from '@/lib/pos-sales-order-type-filter'
import { parseDeliveryAppCodeFromItemsJson } from '@/lib/pos-delivery-order-meta'
import { upsertTaxRecipientFromOrderMemo } from '@/lib/pos-tax-invoice-recipients-server'

/** 주문 번호 생성 (8자리: ST0317A3 = 매장2자+MMDD+랜덤2자) */
function generateOrderNo(storeCode: string): string {
  const now = new Date()
  const store = (storeCode || 'ST').slice(0, 2).toUpperCase()
  const mmdd = now.toLocaleDateString('en-CA', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Bangkok' }).replace(/\D/g, '')
  const rnd = Math.random().toString(36).slice(2, 4).toUpperCase()
  return `${store}${mmdd}${rnd}`
}

/** POS 주문 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
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
    const memberId = Math.max(0, Number(body.memberId ?? 0))
    const memberNo = String(body.memberNo ?? '').trim()
    const couponCode = String(body.couponCode ?? '').trim().toUpperCase()
    const couponDiscountAmt = Math.max(0, Number(body.couponDiscountAmt ?? 0))
    const pointUsed = Math.max(0, Math.trunc(Number(body.pointUsed ?? 0)))
    const pointEarnedReq = Math.max(0, Math.trunc(Number(body.pointEarned ?? 0)))
    const guestCountReq = Math.trunc(Number(body.guestCount ?? body.guest_count ?? 0))
    const items = Array.isArray(body.items) ? body.items : []
    const pricingAdjustments = body.pricingAdjustments || {}

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

    const orderNo = generateOrderNo(storeCode)
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
      member_id: memberId || null,
      member_no: memberNo || null,
      coupon_code: couponCode || null,
      coupon_discount_amt: couponDiscountAmt,
      point_used: pointUsed,
      point_earned: pointEarnedReq,
      guest_count,
      delivery_app_code,
    }
    const inserted = await supabaseInsert('pos_orders', row) as { id?: number }[]
    const created = Array.isArray(inserted) ? inserted[0] : inserted

    const paymentSum = paymentCash + paymentCard + paymentQr + paymentOther
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
