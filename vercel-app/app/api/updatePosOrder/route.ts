import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { supabaseUpdateByFilterWithPgrst204Fallback } from '@/lib/supabase-pgrst204-retry'
import { applyLoyaltyOnOrder } from '@/lib/members-server'
import { computePosPricing } from '@/lib/pos-pricing'
import { isDineInOrderTypeForGuestCount } from '@/lib/pos-sales-order-type-filter'

const DELIVERY_PAYMENT_CHANNELS = new Set(['grab', 'lineman', 'shopee', 'dine_in'])

function normalizeDeliveryPaymentChannel(raw: unknown, paymentDeliveryApp: number): string | null {
  if (paymentDeliveryApp <= 0.005) return null
  const s = String(raw ?? '').trim().toLowerCase()
  if (DELIVERY_PAYMENT_CHANNELS.has(s)) return s
  return 'grab'
}

const EDITABLE_STATUSES = ['pending', 'paid', 'preparing', 'cooking', 'ready', 'completed']

/** POS 주문 수정 (항목·메모·할인·주문번호 등) - completed 전까지 수정 가능 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const fromOfflineQueueSync =
      String(req.headers.get('x-cm-offline-queue-sync') ?? '').trim().toLowerCase() === '1'
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
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
    const paymentDeliveryApp = Math.max(0, Number(body?.paymentDeliveryApp ?? body?.payment_delivery_app ?? 0))
    const deliveryPaymentChannel = normalizeDeliveryPaymentChannel(
      body?.deliveryPaymentChannel ?? body?.delivery_payment_channel,
      paymentDeliveryApp
    )
    const memberId = Math.max(0, Number(body?.memberId ?? 0))
    const memberNo = String(body?.memberNo ?? '').trim()
    const couponCode = String(body?.couponCode ?? '').trim().toUpperCase()
    const couponDiscountAmt = Math.max(0, Number(body?.couponDiscountAmt ?? 0))
    const pointUsed = Math.max(0, Math.trunc(Number(body?.pointUsed ?? 0)))
    const pointEarnedReq = Math.max(0, Math.trunc(Number(body?.pointEarned ?? 0)))
    const guestCountBody = body?.guestCount ?? body?.guest_count
    const pricingAdjustments = body?.pricingAdjustments || {}
    const linkposPayment =
      body?.linkposPayment && typeof body.linkposPayment === 'object'
        ? (body.linkposPayment as Record<string, unknown>)
        : null

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
    )) as { id?: number; status?: string; point_earned?: number; order_type?: string }[] | null

    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
    }

    const status = String(existing[0]?.status ?? '')
    if (!EDITABLE_STATUSES.includes(status)) {
      if (fromOfflineQueueSync) {
        return NextResponse.json(
          { success: true, noop: true, message: 'skip_stale_order_update_replay' },
          { headers }
        )
      }
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
    const pricing = computePosPricing({
      subtotal,
      discountAmt,
      deliveryFee: 0,
      packagingFee: 0,
      cardPaymentAmount: paymentCard,
      adjustments: pricingAdjustments,
    })
    const vat = pricing.vatFeeAmt
    const total = pricing.finalTotal

    const patch: Record<string, unknown> = {
      table_name: tableName,
      memo,
      discount_amt: discountAmt,
      discount_reason: discountReason,
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
      items_json: JSON.stringify(items),
      subtotal,
      vat,
      total,
    }

    if (linkposPayment) {
      patch.linkpos_provider = String(linkposPayment.provider ?? 'kbtg_linkpos')
      patch.linkpos_mode = String(linkposPayment.mode ?? 'hypercom')
      patch.linkpos_tx_code = String(linkposPayment.txCode ?? '20')
      patch.linkpos_bank_id = String(linkposPayment.bankId ?? '')
      patch.linkpos_response_code = String(linkposPayment.responseCode ?? '')
      patch.linkpos_approval_code = String(linkposPayment.approvalCode ?? '')
      patch.linkpos_trace_no = String(linkposPayment.traceNo ?? '')
      patch.linkpos_ref_no = String(linkposPayment.refNo ?? '')
      patch.linkpos_terminal_id = String(linkposPayment.terminalId ?? '')
      patch.linkpos_merchant_id = String(linkposPayment.merchantId ?? '')
      patch.linkpos_reference1 = String(linkposPayment.reference1 ?? '')
      patch.linkpos_requested_amount = Number(linkposPayment.requestedAmount ?? 0)
      patch.linkpos_approved_amount = Number(linkposPayment.approvedAmount ?? 0)
      patch.linkpos_requested_at = String(linkposPayment.requestedAt ?? '')
      patch.linkpos_responded_at = String(linkposPayment.respondedAt ?? '')
    }

    if (guestCountBody !== undefined && guestCountBody !== null) {
      const g = Math.trunc(Number(guestCountBody))
      if (!Number.isNaN(g) && isDineInOrderTypeForGuestCount(existing[0]?.order_type)) {
        patch.guest_count = Math.max(0, Math.min(99, g))
      }
    }

    await supabaseUpdateByFilterWithPgrst204Fallback('pos_orders', `id=eq.${id}`, patch, 'updatePosOrder')

    if (linkposPayment) {
      try {
        await supabaseInsert('pos_payment_attempts', {
          order_id: id,
          local_tx_id: String(linkposPayment.reference1 ?? '').slice(0, 20),
          provider: String(linkposPayment.provider ?? 'kbtg_linkpos'),
          mode: String(linkposPayment.mode ?? 'hypercom'),
          tx_code: String(linkposPayment.txCode ?? '20'),
          bank_id: String(linkposPayment.bankId ?? ''),
          request_amount: Number(linkposPayment.requestedAmount ?? 0),
          approved_amount: Number(linkposPayment.approvedAmount ?? 0),
          response_code: String(linkposPayment.responseCode ?? ''),
          approval_code: String(linkposPayment.approvalCode ?? ''),
          trace_no: String(linkposPayment.traceNo ?? ''),
          terminal_id: String(linkposPayment.terminalId ?? ''),
          merchant_id: String(linkposPayment.merchantId ?? ''),
          status: String(linkposPayment.responseCode ?? '') === '00' ? 'approved' : 'declined',
          created_at: String(linkposPayment.requestedAt ?? new Date().toISOString()),
        })
      } catch (e) {
        console.error('updatePosOrder linkpos attempt insert:', e)
      }
    }

    const paymentSum = paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryApp
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
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        success: false,
        message: msg.slice(0, 500),
        retryAfterQueue: true,
      },
      { headers }
    )
  }
}
