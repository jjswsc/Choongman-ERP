import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { supabaseUpdateByFilterWithPgrst204Fallback } from '@/lib/supabase-pgrst204-retry'
import { applyLoyaltyOnOrder } from '@/lib/members-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { writePosOrderAuditTrail } from '@/lib/pos-order-audit'
import { computePosPricing } from '@/lib/pos-pricing'
import { isDineInOrderTypeForGuestCount, sanitizePosOrderTableNameForDb } from '@/lib/pos-sales-order-type-filter'
import {
  coercePaymentOtherBreakdownForSave,
  paymentOtherBreakdownForDb,
} from '@/lib/pos-payment-other-breakdown'
import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
import { enrichOrderItemsWithOptionCode } from '@/lib/pos-option-code-enrich'

const DELIVERY_PAYMENT_CHANNELS = new Set(['grab', 'lineman', 'shopee', 'dine_in'])
function isMissingServiceColumnsError(e: unknown): boolean {
  const msg = String(e ?? '').toLowerCase()
  return (
    (msg.includes('service_amt') || msg.includes('service_reason')) &&
    (msg.includes('column') || msg.includes('schema cache'))
  )
}

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
    const auth = await getVerifiedAuth(req)
    const fromOfflineQueueSync =
      String(req.headers.get('x-cm-offline-queue-sync') ?? '').trim().toLowerCase() === '1'
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
    const id = Number(body?.id)
    const itemsRaw = Array.isArray(body?.items) ? body.items : []
    const items = await enrichOrderItemsWithOptionCode(itemsRaw)
    const memo = String(body?.memo ?? '').trim()
    const discountAmt = Math.max(0, Number(body?.discountAmt ?? 0))
    const discountReason = String(body?.discountReason ?? '').trim()
    const serviceAmt = Math.max(0, Number(body?.serviceAmt ?? body?.service_amt ?? 0))
    const serviceReason = String(body?.serviceReason ?? body?.service_reason ?? '').trim()
    const discountAmtNet = Math.max(0, discountAmt - serviceAmt)
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
      {
        limit: 1,
        select:
          'id,order_no,store_code,status,point_earned,order_type,table_name,memo,discount_amt,discount_reason,service_amt,service_reason,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,delivery_payment_channel,member_id,member_no,coupon_code,coupon_discount_amt,point_used,point_earned,guest_count,subtotal,vat,total',
      }
    )) as {
      id?: number
      order_no?: string
      store_code?: string
      status?: string
      point_earned?: number
      order_type?: string
      table_name?: string
      memo?: string
      discount_amt?: number
      discount_reason?: string | null
      service_amt?: number
      service_reason?: string | null
      payment_cash?: number
      payment_card?: number
      payment_qr?: number
      payment_other?: number
      payment_delivery_app?: number
      delivery_payment_channel?: string | null
      member_id?: number | null
      member_no?: string | null
      coupon_code?: string | null
      coupon_discount_amt?: number
      point_used?: number
      guest_count?: number
      subtotal?: number
      vat?: number
      total?: number
    }[] | null

    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
    }
    const current = existing[0]
    const tableName = sanitizePosOrderTableNameForDb(current?.order_type, body?.tableName)

    const statusRaw = String(current?.status ?? '').trim()
    const status = statusRaw.toLowerCase()
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
      const qty = resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown })
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

    const paymentOtherBreakdown = coercePaymentOtherBreakdownForSave(
      paymentOther,
      body?.paymentOtherBreakdown ?? body?.payment_other_breakdown
    )
    const paymentOtherBreakdownDb = paymentOtherBreakdownForDb(paymentOtherBreakdown)

    const patch: Record<string, unknown> = {
      table_name: tableName,
      memo,
      discount_amt: discountAmtNet,
      discount_reason: discountReason,
      service_amt: serviceAmt,
      service_reason: serviceReason || null,
      payment_cash: paymentCash,
      payment_card: paymentCard,
      payment_qr: paymentQr,
      payment_other: paymentOther,
      ...(paymentOther <= 0.005
        ? { payment_other_breakdown: null }
        : paymentOtherBreakdownDb
          ? { payment_other_breakdown: paymentOtherBreakdownDb }
          : { payment_other_breakdown: null }),
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
      if (!Number.isNaN(g) && isDineInOrderTypeForGuestCount(current?.order_type)) {
        patch.guest_count = Math.max(0, Math.min(99, g))
      }
    }

    try {
      await supabaseUpdateByFilterWithPgrst204Fallback('pos_orders', `id=eq.${id}`, patch, 'updatePosOrder')
    } catch (e) {
      if (!isMissingServiceColumnsError(e)) throw e
      const legacyPatch = { ...patch }
      delete legacyPatch.service_amt
      delete legacyPatch.service_reason
      legacyPatch.discount_amt = discountAmt
      if (serviceAmt > 0) {
        const baseReason = String(legacyPatch.discount_reason ?? '').trim()
        const svcReason = serviceReason || `service:${serviceAmt}`
        legacyPatch.discount_reason = [baseReason, svcReason].filter(Boolean).join(' · ')
      }
      await supabaseUpdateByFilterWithPgrst204Fallback('pos_orders', `id=eq.${id}`, legacyPatch, 'updatePosOrder')
    }

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
    const previousEarned = Number(current?.point_earned || 0)
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

    const auditBefore: Record<string, unknown> = {
      table_name: current?.table_name ?? null,
      memo: current?.memo ?? null,
      discount_amt: current?.discount_amt ?? 0,
      discount_reason: current?.discount_reason ?? null,
      service_amt: current?.service_amt ?? 0,
      service_reason: current?.service_reason ?? null,
      payment_cash: current?.payment_cash ?? 0,
      payment_card: current?.payment_card ?? 0,
      payment_qr: current?.payment_qr ?? 0,
      payment_other: current?.payment_other ?? 0,
      payment_delivery_app: current?.payment_delivery_app ?? 0,
      delivery_payment_channel: current?.delivery_payment_channel ?? null,
      member_id: current?.member_id ?? null,
      member_no: current?.member_no ?? null,
      coupon_code: current?.coupon_code ?? null,
      coupon_discount_amt: current?.coupon_discount_amt ?? 0,
      point_used: current?.point_used ?? 0,
      point_earned: current?.point_earned ?? 0,
      guest_count: current?.guest_count ?? null,
      subtotal: current?.subtotal ?? 0,
      vat: current?.vat ?? 0,
      total: current?.total ?? 0,
    }
    const auditAfter: Record<string, unknown> = {
      table_name: tableName ?? null,
      memo,
      discount_amt: discountAmtNet,
      discount_reason: discountReason || null,
      service_amt: serviceAmt,
      service_reason: serviceReason || null,
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
      point_earned: pointEarned,
      guest_count:
        guestCountBody !== undefined && guestCountBody !== null
          ? Number(patch.guest_count ?? current?.guest_count ?? null)
          : current?.guest_count ?? null,
      subtotal,
      vat,
      total,
    }
    await writePosOrderAuditTrail({
      orderId: id,
      orderNo: current?.order_no || null,
      storeCode: current?.store_code || null,
      actionType: 'update_order',
      source: fromOfflineQueueSync ? 'offline_queue' : 'api',
      actor: {
        name: String(auth?.name || body?.updatedBy || body?.createdBy || '').trim() || null,
        role: String(auth?.role || '').trim() || null,
        store: String(auth?.store || '').trim() || null,
        employeeCode: String(auth?.employeeCode || '').trim() || null,
        employeeId:
          auth?.employeeId != null && Number.isFinite(Number(auth.employeeId))
            ? Math.floor(Number(auth.employeeId))
            : null,
      },
      before: auditBefore,
      after: auditAfter,
      reason: fromOfflineQueueSync ? 'offline_sync_update' : 'manual_order_update',
    })

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
