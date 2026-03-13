import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { applyLoyaltyOnOrder } from '@/lib/members-server'

const EDITABLE_STATUSES = ['pending', 'paid']

/** POS 주문 수정 (항목·메모·할인 등) - pending/paid 상태만 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const id = Number(body?.id)
    const items = Array.isArray(body?.items) ? body.items : []
    const tableName = String(body?.tableName ?? '').trim()
    const memo = String(body?.memo ?? '').trim()
    const discountAmt = Math.max(0, Number(body?.discountAmt ?? 0))
    const discountReason = String(body?.discountReason ?? '').trim()
    const paymentCash = Math.max(0, Number(body?.paymentCash ?? 0))
    const paymentCard = Math.max(0, Number(body?.paymentCard ?? 0))
    const paymentQr = Math.max(0, Number(body?.paymentQr ?? 0))
    const paymentOther = Math.max(0, Number(body?.paymentOther ?? 0))
    const memberId = Math.max(0, Number(body?.memberId ?? 0))
    const memberNo = String(body?.memberNo ?? '').trim()
    const couponCode = String(body?.couponCode ?? '').trim().toUpperCase()
    const couponDiscountAmt = Math.max(0, Number(body?.couponDiscountAmt ?? 0))
    const pointUsed = Math.max(0, Math.trunc(Number(body?.pointUsed ?? 0)))
    const pointEarnedReq = Math.max(0, Math.trunc(Number(body?.pointEarned ?? 0)))

    if (!id || items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'id and items required' },
        { headers }
      )
    }

    const existing = (await supabaseSelectFilter(
      'pos_orders',
      `id=eq.${id}`,
      { limit: 1 }
    )) as { id?: number; status?: string; point_earned?: number }[] | null

    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
    }

    const status = String(existing[0]?.status ?? '')
    if (!EDITABLE_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, message: '대기/결제완료 상태만 수정할 수 있습니다.' },
        { headers }
      )
    }

    let subtotal = 0
    for (const it of items) {
      const price = Number(it.price ?? 0)
      const qty = Number(it.qty ?? 1)
      subtotal += price * qty
    }
    const afterDiscount = Math.max(0, subtotal - discountAmt)
    const vat = Math.round(afterDiscount * (7 / 107) * 100) / 100
    const total = afterDiscount

    const patch: Record<string, unknown> = {
      table_name: tableName,
      memo,
      discount_amt: discountAmt,
      discount_reason: discountReason,
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
      items_json: JSON.stringify(items),
      subtotal,
      vat,
      total,
    }

    await supabaseUpdateByFilter('pos_orders', `id=eq.${id}`, patch)

    const paymentSum = paymentCash + paymentCard + paymentQr + paymentOther
    let pointEarned = pointEarnedReq
    const previousEarned = Number(existing[0]?.point_earned || 0)
    if (memberId > 0 && paymentSum > 0 && previousEarned <= 0) {
      const loyalty = await applyLoyaltyOnOrder({
        memberId,
        orderId: id,
        totalAmount: total,
        pointUsed,
        pointEarned: pointEarnedReq,
        couponCode,
      })
      pointEarned = loyalty.pointEarned
      await supabaseUpdateByFilter('pos_orders', `id=eq.${id}`, {
        point_earned: pointEarned,
      })
    }

    return NextResponse.json({ success: true, pointEarned }, { headers })
  } catch (e) {
    console.error('updatePosOrder:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
