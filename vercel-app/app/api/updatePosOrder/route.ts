import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import {
  supabaseSelectFilterStrippingUnknownColumns,
  supabaseUpdateByFilterWithPgrst204Fallback,
} from '@/lib/supabase-pgrst204-retry'
import { roundMemberPointsEarn } from '@/lib/member-points-math'
import { applyLoyaltyOnOrder, ensurePosOrderLoyaltyApplied } from '@/lib/members-server'
import { posApiCorsHeaders } from '@/lib/pos-api-write-auth'
import { authCanAccessPosStoreWrite } from '@/lib/pos-store-access-server'
import { requireAuth } from '@/lib/verify-auth'
import { writePosOrderAuditTrail } from '@/lib/pos-order-audit'
import { resolvePosOrderPaidAtStampIso, posOrderPaymentSumFromAmounts } from '@/lib/pos-order-paid-at'
import { computePosPricing } from '@/lib/pos-pricing'
import { isDineInOrderTypeForGuestCount, sanitizePosOrderTableNameForDb } from '@/lib/pos-sales-order-type-filter'
import {
  coercePaymentOtherBreakdownForSave,
  paymentOtherBreakdownForDb,
} from '@/lib/pos-payment-other-breakdown'
import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
import { enrichOrderItemsWithOptionCode } from '@/lib/pos-option-code-enrich-server'
import { enrichOrderItemsWithPromoRegularPrice } from '@/lib/pos-order-promo-regular-price-server'
import { filterKitchenCartLinesForDineInAdd } from '@/lib/pos-kitchen-dine-in-delta'
import { formatGrabLineNoteForKitchenPrint } from '@/lib/grab-pos-order-enrich'
import { enqueueKitchenPrintJob } from '@/lib/pos-print-job-queue'
import { buildKitchenJobUpdateDedupeKey } from '@/lib/pos-kitchen-print-dedupe-key'
import { reserveRequestIdempotencyKey } from '@/lib/request-idempotency'
import {
  parseAppliedCouponsFromBody,
  persistPosOrderCouponRedemptions,
  redeemMemberCouponIssuesForPaidOrder,
  resolvePosOrderCouponsForSave,
} from '@/lib/pos-coupon-server'
import { mergePosOrderAppliedCouponsFromRequest, resolveAppliedCouponsForOrderDbSave, isPosOrderCouponPaymentSettled } from '@/lib/pos-order-coupon-fields'
import { assertPosBusinessOpenForExistingOrderSave } from '@/lib/pos-business-open-gate-server'
import { resolveDeliveryPaymentChannelForSave } from '@/lib/pos-delivery-platform'
import { normalizePosPaymentTender } from '@/lib/pos-payment-tender-normalize'
import { syncPosPaymentDeliveryAppToNetTotal } from '@/lib/pos-delivery-app-settlement-amount'
import {
  paymentOtherBreakdownAfterReconcile,
  readPreservedPosOrderPaymentAmounts,
  reconcilePosOrderPaymentTenderGap,
  shouldPreserveExistingPosOrderPayment,
} from '@/lib/pos-order-payment-reconcile'
import { preserveGrabDeliveryMemoAnchor } from '@/lib/grab-order-memo'
import { resolveManualDiscountNetForOrderSave } from '@/lib/pos-order-save-discount'
import { settlePosOrderPaymentFast } from '@/lib/settle-pos-order-payment-fast'
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'

function isMissingServiceColumnsError(e: unknown): boolean {
  const msg = String(e ?? '').toLowerCase()
  return (
    (msg.includes('service_amt') || msg.includes('service_reason')) &&
    (msg.includes('column') || msg.includes('schema cache'))
  )
}

const EDITABLE_STATUSES = ['pending', 'paid', 'preparing', 'cooking', 'ready', 'completed']

/** POS 주문 수정 (항목·메모·할인·주문번호 등) - completed 전까지 수정 가능 */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()

  try {
    const authResult = await requireAuth(req, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth!
    const fromOfflineQueueSync =
      String(req.headers.get('x-cm-offline-queue-sync') ?? '').trim().toLowerCase() === '1'
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
    const id = Number(body?.id)
    const idempotencyKey = String(req.headers.get('x-idempotency-key') ?? '').trim()
    /**
     * Omni 결제 단축: 클라이언트 skipPostPaymentSideEffects=true.
     * items enrich·재계산·주방·동기 적립 없이 결제 필드만 저장.
     * body.items 가 있어도 단축 유지(결제 UI는 항상 items 전송) — 품목 JSON은 무시하고
     * 주문·추가주문 시 저장된 DB 품목을 유지한다.
     */
    const skipPostPaymentSideEffectsEarly =
      body.skipPostPaymentSideEffects === true ||
      String(body.skipPostPaymentSideEffects ?? '') === '1'
    if (skipPostPaymentSideEffectsEarly && id && !Number.isNaN(id)) {
      return await settlePosOrderPaymentFast({
        auth,
        body,
        fromOfflineQueueSync,
        idempotencyKey,
      })
    }

    const itemsRaw = Array.isArray(body?.items) ? body.items : []
    const itemsWithOption = await enrichOrderItemsWithOptionCode(itemsRaw)
    let items = itemsWithOption
    const discountAmt = Math.max(0, Number(body?.discountAmt ?? 0))
    const discountReason = String(body?.discountReason ?? '').trim()
    const serviceAmt = Math.max(0, Number(body?.serviceAmt ?? body?.service_amt ?? 0))
    const serviceReason = String(body?.serviceReason ?? body?.service_reason ?? '').trim()
    let paymentCash = Math.max(0, Number(body?.paymentCash ?? 0))
    const paymentCashTendered = Math.max(0, Number(body?.paymentCashTendered ?? body?.payment_cash_tendered ?? 0))
    const paymentQrType = String(body?.paymentQrType ?? body?.payment_qr_type ?? '').trim()
    const normalizedTender = normalizePosPaymentTender({
      paymentCard: Number(body?.paymentCard ?? 0),
      paymentQr: Number(body?.paymentQr ?? 0),
      paymentQrType,
    })
    let paymentCard = normalizedTender.paymentCard
    let paymentQr = normalizedTender.paymentQr
    let paymentOther = Math.max(0, Number(body?.paymentOther ?? 0))
    let paymentDeliveryApp = Math.max(0, Number(body?.paymentDeliveryApp ?? body?.payment_delivery_app ?? 0))
    const pointEarnedReq = roundMemberPointsEarn(body?.pointEarned)
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

    if (idempotencyKey) {
      const duplicated = await reserveRequestIdempotencyKey({
        scope: `update_pos_order:${id}`,
        key: idempotencyKey,
        payload: { id, source: fromOfflineQueueSync ? 'offline_queue' : 'api' },
      })
      if (duplicated) {
        return NextResponse.json({ success: true, noop: true, duplicate: true }, { headers })
      }
    }

    const existing = (await supabaseSelectFilterStrippingUnknownColumns(
      'pos_orders',
      `id=eq.${id}`,
      {
        limit: 1,
        select:
          'id,order_no,store_code,status,point_earned,order_type,table_name,memo,discount_amt,discount_reason,service_amt,service_reason,payment_cash,payment_card,payment_qr,payment_other,payment_other_breakdown,payment_delivery_app,delivery_payment_channel,delivery_app_code,member_id,member_no,coupon_code,coupon_discount_amt,applied_coupons,point_used,point_earned,guest_count,subtotal,vat,total,paid_at,items_json,created_by',
      },
      'updatePosOrder'
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
      payment_other_breakdown?: unknown
      payment_delivery_app?: number
      delivery_payment_channel?: string | null
      delivery_app_code?: string | null
      member_id?: number | null
      member_no?: string | null
      coupon_code?: string | null
      coupon_discount_amt?: number
      applied_coupons?: unknown
      point_used?: number
      guest_count?: number
      subtotal?: number
      vat?: number
      total?: number
      paid_at?: string | null
      items_json?: unknown
      created_by?: string | null
    }[] | null

    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
    }
    const current = existing[0]

    const incomingPaymentSum = posOrderPaymentSumFromAmounts({
      paymentCash,
      paymentCard,
      paymentQr,
      paymentOther,
      paymentDeliveryApp,
    })
    const existingPaymentSum = posOrderPaymentSumFromAmounts({
      paymentCash: Number(current?.payment_cash ?? 0),
      paymentCard: Number(current?.payment_card ?? 0),
      paymentQr: Number(current?.payment_qr ?? 0),
      paymentOther: Number(current?.payment_other ?? 0),
      paymentDeliveryApp: Number(current?.payment_delivery_app ?? 0),
    })
    if (
      shouldPreserveExistingPosOrderPayment({
        body,
        currentPaymentSum: existingPaymentSum,
        incomingPaymentSum,
      })
    ) {
      const preserved = readPreservedPosOrderPaymentAmounts(current)
      paymentCash = preserved.paymentCash
      paymentCard = preserved.paymentCard
      paymentQr = preserved.paymentQr
      paymentOther = preserved.paymentOther
      paymentDeliveryApp = preserved.paymentDeliveryApp
    }

    if (!(await authCanAccessPosStoreWrite(auth, String(current?.store_code ?? '')))) {
      return NextResponse.json(
        { success: false, message: '해당 매장에 대한 권한이 없습니다.' },
        { status: 403, headers }
      )
    }

    const memberId =
      body?.memberId != null && body?.memberId !== ''
        ? Math.max(0, Number(body.memberId))
        : Math.max(0, Number(current?.member_id || 0))
    const memberNo =
      body?.memberNo != null && String(body.memberNo).trim() !== ''
        ? String(body.memberNo).trim()
        : String(current?.member_no || '').trim()
    const pointUsed =
      body?.pointUsed != null && body?.pointUsed !== ''
        ? roundMemberPointsEarn(body.pointUsed)
        : roundMemberPointsEarn(current?.point_used)

    const memo = preserveGrabDeliveryMemoAnchor(String(body?.memo ?? ''), String(current?.memo ?? ''))

    const openCheck = await assertPosBusinessOpenForExistingOrderSave({
      orderStoreCode: String(current?.store_code ?? ''),
      terminalStoreCode: String(body?.terminalStoreCode ?? body?.storeCode ?? '').trim() || undefined,
    })
    if (!openCheck.ok) {
      return NextResponse.json(
        { success: false, message: openCheck.message, retryAfterQueue: false },
        { headers }
      )
    }

    /** select에서 service_amt를 뺐다면 DB에 컬럼이 없는 레거시 스키마 — PATCH도 할인 필드 정합에 맞춘다 */
    const hasServiceColumns = Object.prototype.hasOwnProperty.call(current ?? {}, 'service_amt')
    const tableName = sanitizePosOrderTableNameForDb(current?.order_type, body?.tableName)

    let deliveryAppCode = String(body?.deliveryAppCode ?? body?.delivery_app_code ?? '')
      .trim()
      .toLowerCase()
    if (!deliveryAppCode) {
      for (const it of items) {
        const c = String((it as { deliveryAppCode?: string }).deliveryAppCode ?? '')
          .trim()
          .toLowerCase()
        if (c) {
          deliveryAppCode = c
          break
        }
      }
    }
    const deliveryPaymentChannel = resolveDeliveryPaymentChannelForSave({
      deliveryAppCode: deliveryAppCode || undefined,
      deliveryPaymentChannel:
        String(body?.deliveryPaymentChannel ?? body?.delivery_payment_channel ?? '').trim() || undefined,
      tableName,
      memo,
      orderNo: current?.order_no,
      paymentDeliveryApp,
      itemDeliveryAppCodes: items.map((it) =>
        String((it as { deliveryAppCode?: string }).deliveryAppCode ?? '').trim() || undefined
      ),
    })

    const statusRaw = String(current?.status ?? '').trim()
    const status = statusRaw.toLowerCase()
    if (!EDITABLE_STATUSES.includes(status)) {
      if (fromOfflineQueueSync) {
        return NextResponse.json(
          { success: true, noop: true, message: 'skip_stale_order_update_replay' },
          { headers }
        )
      }
      const closedMsg =
        status === 'cancelled' || status === 'canceled' || status === 'refunded'
          ? '이미 취소·환불된 주문입니다. 목록을 새로고침해 주세요.'
          : '대기/결제완료 상태만 수정할 수 있습니다.'
      return NextResponse.json({ success: false, message: closedMsg }, { headers })
    }

    items = await enrichOrderItemsWithPromoRegularPrice(
      itemsWithOption,
      current?.order_type ?? body?.orderType ?? body?.order_type
    )

    let subtotal = 0
    for (const it of items) {
      const price = Number(it.price ?? 0)
      const qty = resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown })
      subtotal += price * qty
    }

    const mergedAppliedCoupons = mergePosOrderAppliedCouponsFromRequest(body ?? {}, current?.applied_coupons)

    let appliedPre = mergedAppliedCoupons
    const legacyCouponCode = String(body?.couponCode ?? body?.coupon_code ?? '').trim().toUpperCase()
    const legacyCouponAmt = Math.max(0, Number(body?.couponDiscountAmt ?? body?.coupon_discount_amt ?? 0))
    if (!appliedPre.length && legacyCouponCode) {
      appliedPre = [{ code: legacyCouponCode, name: legacyCouponCode, discountAmt: legacyCouponAmt, quantity: 1 }]
    }
    const preCouponSum = appliedPre.reduce((s, row) => s + Math.max(0, Number(row.discountAmt ?? 0) || 0), 0)
    const discountAmtNet = resolveManualDiscountNetForOrderSave({ discountAmt, serviceAmt, items })
    const manualDiscountForCoupons = Math.max(0, discountAmtNet - preCouponSum)
    const collabDiscountAmt = Math.max(0, Number(body?.collabDiscountAmt ?? body?.collab_discount_amt ?? 0))
    const tierDiscountAmt = Math.max(0, Number(body?.tierDiscountAmt ?? body?.tier_discount_amt ?? 0))
    const memberTierCode =
      String(body?.memberTierCode ?? body?.member_tier_code ?? '').trim().toUpperCase() || null
    const couponResolved = await resolvePosOrderCouponsForSave({
      body: {
        ...(body ?? {}),
        ...(appliedPre.length ? { appliedCoupons: appliedPre } : {}),
      },
      subtotal,
      manualDiscountAmt: Math.max(0, manualDiscountForCoupons - collabDiscountAmt - tierDiscountAmt),
      collabDiscountAmt,
      tierDiscountAmt,
      memberId: memberId || undefined,
    })
    const couponCode = couponResolved.couponCode
    const couponDiscountAmt = couponResolved.couponDiscountAmt
    const appliedCoupons = couponResolved.appliedCoupons
    const couponDbSave = resolveAppliedCouponsForOrderDbSave({
      appliedPre,
      validated: appliedCoupons,
      validatedCouponCode: couponCode,
      validatedCouponDiscountAmt: couponDiscountAmt,
    })
    const discountAmtForPricing = Math.min(
      subtotal,
      Math.max(0, manualDiscountForCoupons + couponDiscountAmt)
    )
    const discountAmtNetFinal = Math.max(0, discountAmtForPricing - serviceAmt)

    const pricing = computePosPricing({
      subtotal,
      discountAmt: discountAmtForPricing,
      deliveryFee: 0,
      packagingFee: 0,
      cardPaymentAmount: paymentCard,
      adjustments: pricingAdjustments,
    })
    const vat = pricing.vatFeeAmt
    const total = pricing.finalTotal
    let paymentDeliveryAppFinal = syncPosPaymentDeliveryAppToNetTotal({
      paymentDeliveryApp,
      paymentCash,
      paymentCard,
      paymentQr,
      paymentOther,
      total,
    })

    let paymentOtherBreakdown = coercePaymentOtherBreakdownForSave(
      paymentOther,
      body?.paymentOtherBreakdown ?? body?.payment_other_breakdown
    )
    let paymentOtherBreakdownDb = paymentOtherBreakdownForDb(paymentOtherBreakdown)

    const previousPaymentSum = posOrderPaymentSumFromAmounts({
      paymentCash: Number(current?.payment_cash ?? 0),
      paymentCard: Number(current?.payment_card ?? 0),
      paymentQr: Number(current?.payment_qr ?? 0),
      paymentOther: Number(current?.payment_other ?? 0),
      paymentDeliveryApp: Number(current?.payment_delivery_app ?? 0),
    })
    let nextPaymentSum = paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryAppFinal
    if (nextPaymentSum > 0.02) {
      const reconciled = reconcilePosOrderPaymentTenderGap({
        total,
        serviceAmt,
        orderType: String(current?.order_type ?? ''),
        deliveryAppCode: current?.delivery_app_code,
        payment: {
          paymentCash,
          paymentCard,
          paymentQr,
          paymentOther,
          paymentDeliveryApp: paymentDeliveryAppFinal,
        },
        paymentOtherBreakdown:
          body?.paymentOtherBreakdown ??
          body?.payment_other_breakdown ??
          current?.payment_other_breakdown,
      })
      if (reconciled.reconciledGap > 0.02) {
        paymentCash = reconciled.payment.paymentCash
        paymentCard = reconciled.payment.paymentCard
        paymentQr = reconciled.payment.paymentQr
        paymentOther = reconciled.payment.paymentOther
        paymentDeliveryAppFinal = reconciled.payment.paymentDeliveryApp
        paymentOtherBreakdown = coercePaymentOtherBreakdownForSave(
          paymentOther,
          reconciled.paymentOtherBreakdown ?? paymentOtherBreakdown
        )
        const br = paymentOtherBreakdownAfterReconcile({
          paymentOther,
          paymentOtherBreakdown: reconciled.paymentOtherBreakdown ?? paymentOtherBreakdown,
          reconciledGap: reconciled.reconciledGap,
          serviceAmt,
        })
        if (br !== undefined) {
          paymentOtherBreakdownDb = br
        } else {
          paymentOtherBreakdownDb = paymentOtherBreakdownForDb(paymentOtherBreakdown)
        }
        nextPaymentSum =
          paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryAppFinal
      }
    }
    if (total > 0.02 && nextPaymentSum > total + 0.02) {
      return NextResponse.json(
        { success: false, message: 'payment_exceeds_total' },
        { headers }
      )
    }
    const paidAtStamp = resolvePosOrderPaidAtStampIso({
      existingPaidAt: String(current?.paid_at ?? '').trim() || null,
      total,
      previousPaymentSum,
      nextPaymentSum,
      linkposRespondedAt: linkposPayment ? String(linkposPayment.respondedAt ?? '') : null,
    })

    const patch: Record<string, unknown> = {
      table_name: tableName,
      memo,
      discount_amt: discountAmtNetFinal,
      discount_reason: discountReason,
      tier_discount_amt: tierDiscountAmt,
      member_tier_code: memberTierCode,
      service_amt: serviceAmt,
      service_reason: serviceReason || null,
      payment_cash: paymentCash,
      ...(paymentCashTendered > 0.005
        ? { payment_cash_tendered: paymentCashTendered }
        : { payment_cash_tendered: 0 }),
      payment_card: paymentCard,
      payment_qr: paymentQr,
      payment_other: paymentOther,
      ...(paymentOther <= 0.005
        ? { payment_other_breakdown: null }
        : paymentOtherBreakdownDb
          ? { payment_other_breakdown: paymentOtherBreakdownDb }
          : { payment_other_breakdown: null }),
      payment_delivery_app: paymentDeliveryAppFinal,
      delivery_payment_channel: deliveryPaymentChannel,
      member_id: memberId || null,
      member_no: memberNo || null,
      coupon_code: couponDbSave.couponCode || null,
      coupon_discount_amt: couponDbSave.couponDiscountAmt,
      applied_coupons: couponDbSave.appliedCouponsJson,
      point_used: pointUsed,
      point_earned: pointEarnedReq,
      items_json: JSON.stringify(items),
      subtotal,
      vat,
      total,
    }

    if (paidAtStamp) {
      patch.paid_at = paidAtStamp
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
      if (hasServiceColumns) {
        await supabaseUpdateByFilterWithPgrst204Fallback('pos_orders', `id=eq.${id}`, patch, 'updatePosOrder')
      } else {
        const legacyPatch = { ...patch }
        delete legacyPatch.service_amt
        delete legacyPatch.service_reason
        legacyPatch.discount_amt = discountAmtForPricing
        if (serviceAmt > 0) {
          const baseReason = String(legacyPatch.discount_reason ?? '').trim()
          const svcReason = serviceReason || `service:${serviceAmt}`
          legacyPatch.discount_reason = [baseReason, svcReason].filter(Boolean).join(' · ')
        }
        await supabaseUpdateByFilterWithPgrst204Fallback('pos_orders', `id=eq.${id}`, legacyPatch, 'updatePosOrder')
      }
    } catch (e) {
      if (!hasServiceColumns || !isMissingServiceColumnsError(e)) throw e
      const legacyPatch = { ...patch }
      delete legacyPatch.service_amt
      delete legacyPatch.service_reason
      legacyPatch.discount_amt = discountAmtForPricing
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

    const paymentSum = paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryAppFinal
    const paymentComplete = isPosOrderCouponPaymentSettled({
      total,
      paymentSum,
      preCouponSum,
      appliedPreCount: appliedPre.length,
      paidAtStamp,
    })
    /** 결제 직후 updatePosOrderStatus가 이어서 돌 때 — 적립·쿠폰·알림은 status 경로에 맡기고 응답을 빠르게 */
    const skipPostPaymentSideEffects =
      body.skipPostPaymentSideEffects === true ||
      String(body.skipPostPaymentSideEffects ?? '') === '1'
    let pointEarned = pointEarnedReq
    let loyaltyReceipt: {
      memberNo?: string
      phone?: string
      tierCode?: string
      pointBalanceExcludingEarn?: number
    } | null = null
    const previousEarned = Number(current?.point_earned || 0)
    if (!skipPostPaymentSideEffects && memberId > 0 && paymentComplete && previousEarned <= 0) {
      try {
        const loyalty = await applyLoyaltyOnOrder({
          memberId,
          orderId: id,
          storeCode: String(current?.store_code ?? '').trim(),
          totalAmount: total,
          pointUsed,
          pointEarned: pointEarnedReq,
          couponCode: appliedCoupons.length === 1 ? appliedCoupons[0]?.code : couponCode,
          orderNo: String(current?.order_no ?? ''),
          orderType: String(current?.order_type ?? body?.orderType ?? ''),
          createdBy: String(current?.created_by ?? body?.createdBy ?? body?.created_by ?? ''),
        })
        pointEarned = loyalty.pointEarned
        loyaltyReceipt = {
          ...(loyalty.memberNo ? { memberNo: loyalty.memberNo } : {}),
          ...(loyalty.phone ? { phone: loyalty.phone } : {}),
          ...(loyalty.tierCode ? { tierCode: loyalty.tierCode } : {}),
          ...(loyalty.pointBalanceExcludingEarn != null
            ? { pointBalanceExcludingEarn: loyalty.pointBalanceExcludingEarn }
            : {}),
        }
        await supabaseUpdateByFilter('pos_orders', `id=eq.${id}`, {
          point_earned: pointEarned,
        })
      } catch (loyaltyErr) {
        console.error('updatePosOrder loyalty:', loyaltyErr)
      }
    } else if (!skipPostPaymentSideEffects && paymentComplete && previousEarned <= 0) {
      try {
        const ensured = await ensurePosOrderLoyaltyApplied(id)
        if (ensured > 0) pointEarned = ensured
      } catch (loyaltyErr) {
        console.error('updatePosOrder ensure loyalty:', loyaltyErr)
      }
    }
    // 이미 적립된 주문은 body pointEarned가 0이어도 DB 적립분을 스냅샷 차감에 사용
    if (previousEarned > 0) {
      pointEarned = previousEarned
    }
    if (!skipPostPaymentSideEffects && memberId > 0 && paymentComplete) {
      try {
        const { notifyMemberPointLineForPaidOrder } = await import('@/lib/member-point-line-notify')
        await notifyMemberPointLineForPaidOrder({
          orderId: id,
          memberId,
          storeCode: String(current?.store_code ?? '').trim(),
          orderNo: String(current?.order_no ?? ''),
        })
      } catch (notifyErr) {
        console.error('updatePosOrder point line notify:', notifyErr)
      }
    }

    let couponsForRedeem = appliedPre.length > 0 ? appliedPre : appliedCoupons
    if (!couponsForRedeem.length) {
      couponsForRedeem = mergedAppliedCoupons
    }
    if (!couponsForRedeem.length && paymentSum > 0) {
      couponsForRedeem = parseAppliedCouponsFromBody(current?.applied_coupons)
      if (!couponsForRedeem.length) {
        const legacyCode = String(current?.coupon_code ?? '').trim().toUpperCase()
        const legacyAmt = Math.max(0, Number(current?.coupon_discount_amt ?? 0))
        if (legacyCode) {
          couponsForRedeem = [{ code: legacyCode, name: legacyCode, discountAmt: legacyAmt, quantity: 1 }]
        }
      }
    }
    const redeemMemberId =
      memberId || Math.max(0, Math.trunc(Number(current?.member_id ?? 0) || 0)) || undefined

    if (paymentComplete) {
      try {
        if (couponsForRedeem.length > 0) {
          await persistPosOrderCouponRedemptions({
            orderId: id,
            storeCode: String(current?.store_code ?? '').trim(),
            appliedCoupons: couponsForRedeem,
            memberId: redeemMemberId,
          })
        }
        await redeemMemberCouponIssuesForPaidOrder(id)
      } catch (redeemErr) {
        console.error('updatePosOrder coupon redemptions:', redeemErr)
      }
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
      discount_amt: discountAmtNetFinal,
      discount_reason: discountReason || null,
      service_amt: serviceAmt,
      service_reason: serviceReason || null,
      payment_cash: paymentCash,
      payment_card: paymentCard,
      payment_qr: paymentQr,
      payment_other: paymentOther,
      payment_delivery_app: paymentDeliveryAppFinal,
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
    const deferUnpaidSideEffects =
      !isLegacyChoongmanErpSupabase() && paymentSum <= 0.02 && !paymentComplete

    const auditPromise = writePosOrderAuditTrail({
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
    if (deferUnpaidSideEffects) {
      void auditPromise.catch((e) => console.error('updatePosOrder audit:', e))
    } else {
      await auditPromise
    }

    const prevOrderItems = (() => {
      const raw = current?.items_json
      if (Array.isArray(raw)) return raw
      if (raw && typeof raw === 'object') {
        const maybeItems = (raw as { items?: unknown }).items
        return Array.isArray(maybeItems) ? maybeItems : []
      }
      try {
        const parsed = JSON.parse(String(raw ?? '[]')) as unknown
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    })()
    const kitchenDeltaLines = filterKitchenCartLinesForDineInAdd(
      items as Parameters<typeof filterKitchenCartLinesForDineInAdd>[0],
      prevOrderItems as Parameters<typeof filterKitchenCartLinesForDineInAdd>[1],
      { formatNote: (note: string) => formatGrabLineNoteForKitchenPrint(note) }
    )
    const kitchenEnqueuePromise = enqueueKitchenPrintJob({
      storeCode: String(current?.store_code || '').trim(),
      orderId: id,
      orderNo: String(current?.order_no || `POS-${id}`),
      source: fromOfflineQueueSync ? 'offline_queue_update' : 'updatePosOrder',
      dedupeKey: buildKitchenJobUpdateDedupeKey(id, items),
      payload: {
        action: 'update_order',
        status,
        ...(kitchenDeltaLines.length > 0 ? { kitchenLines: kitchenDeltaLines } : {}),
      },
    })
    if (deferUnpaidSideEffects) {
      void kitchenEnqueuePromise.catch((e) => console.error('updatePosOrder kitchen enqueue:', e))
    } else {
      await kitchenEnqueuePromise
    }

    let memberReceipt: Awaited<
      ReturnType<typeof import('@/lib/pos-receipt-member-snapshot-server').loadPosOrderMemberReceiptSnapshot>
    > = null
    if (memberId > 0 && !deferUnpaidSideEffects) {
      try {
        const { loadPosOrderMemberReceiptSnapshot } = await import(
          '@/lib/pos-receipt-member-snapshot-server'
        )
        memberReceipt = await loadPosOrderMemberReceiptSnapshot({
          memberId,
          pointEarned,
        })
      } catch (snapErr) {
        console.error('updatePosOrder member receipt snapshot:', snapErr)
      }
    }

    const receiptMemberNo =
      String(memberReceipt?.memberNo || loyaltyReceipt?.memberNo || memberNo || '').trim() || undefined
    const receiptPhone =
      String(memberReceipt?.memberPhone || loyaltyReceipt?.phone || '').trim() || undefined
    const receiptTier =
      String(memberReceipt?.memberTierCode || loyaltyReceipt?.tierCode || '').trim() || undefined
    const receiptBalance =
      loyaltyReceipt?.pointBalanceExcludingEarn ?? memberReceipt?.memberPointBalance ?? undefined

    return NextResponse.json(
      {
        success: true,
        pointEarned,
        ...(memberId > 0 ? { memberId } : {}),
        ...(receiptMemberNo ? { memberNo: receiptMemberNo } : {}),
        ...(receiptPhone ? { memberPhone: receiptPhone } : {}),
        ...(receiptTier ? { memberTierCode: receiptTier } : {}),
        ...(receiptBalance != null ? { memberPointBalance: receiptBalance } : {}),
      },
      { headers }
    )
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
