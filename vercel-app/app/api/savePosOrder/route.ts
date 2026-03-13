import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { applyLoyaltyOnOrder } from '@/lib/members-server'

/** 주문 번호 생성 (POS-YYYYMMDD-HHMMSS-랜덤) */
function generateOrderNo(storeCode: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '')
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${storeCode || 'ST'}-${dateStr}-${timeStr}-${rnd}`
}

/** POS 주문 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const storeCode = String(body.storeCode ?? '').trim()
    const orderType = String(body.orderType ?? 'dine_in')
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
    const items = Array.isArray(body.items) ? body.items : []

    if (items.length === 0) {
      return NextResponse.json({ success: false, message: '주문 항목이 없습니다.' }, { headers })
    }

    let subtotal = 0
    for (const it of items) {
      const price = Number(it.price ?? 0)
      const qty = Number(it.qty ?? 1)
      subtotal += price * qty
    }
    const afterDiscount = Math.max(0, subtotal - discountAmt)
    const afterFees = afterDiscount + deliveryFee + packagingFee
    // 태국 VAT 7% (VAT 포함가 기준)
    const vat = Math.round(afterFees * (7 / 107) * 100) / 100
    const total = afterFees

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
