/**
 * Omni 결제 완료 단축: items enrich·쿠폰 재검증·주방 enqueue·동기 적립 없이
 * 결제 필드(+ paid_at·회원·메모)만 UPDATE 하고 바로 응답.
 * 재고·분개·적립·쿠폰 소진은 이어지는 updatePosOrderStatus 에 맡긴다.
 */
import { NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import {
  extractAnyMissingColumn,
  supabaseSelectFilterStrippingUnknownColumns,
} from '@/lib/supabase-pgrst204-retry'
import { roundMemberPointsEarn } from '@/lib/member-points-math'
import { posApiCorsHeaders } from '@/lib/pos-api-write-auth'
import { authCanAccessPosStoreWrite } from '@/lib/pos-store-access-server'
import { writePosOrderAuditTrail } from '@/lib/pos-order-audit'
import {
  nullableTimestamptz,
  resolvePosOrderPaidAtStampIso,
  posOrderPaymentSumFromAmounts,
} from '@/lib/pos-order-paid-at'
import { isDineInOrderTypeForGuestCount, sanitizePosOrderTableNameForDb } from '@/lib/pos-sales-order-type-filter'
import {
  coercePaymentOtherBreakdownForSave,
  paymentOtherBreakdownForDb,
} from '@/lib/pos-payment-other-breakdown'
import {
  parseAppliedCouponsFromBody,
  persistPosOrderCouponRedemptions,
  redeemMemberCouponIssuesForPaidOrder,
} from '@/lib/pos-coupon-server'
import { isPosOrderCouponPaymentSettled } from '@/lib/pos-order-coupon-fields'
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
import { releaseRequestIdempotencyKey, reserveRequestIdempotencyKey } from '@/lib/request-idempotency'
import { loadPosPricingAdjustmentsForStore } from '@/lib/pos-pricing-adjustments-server'
import {
  alignPaymentToRecomputedDue,
  coercePosPricingAdjustmentsFromBody,
  resolveAlignedDueTotal,
} from '@/lib/pos-order-payment-due-align'
import type { JwtPayload } from '@/lib/jwt-auth'

const EDITABLE_STATUSES = ['pending', 'paid', 'preparing', 'cooking', 'ready', 'completed']

/** 워커 수명 동안 없는 컬럼 재시도 RTT 제거 (첫 결제만 학습) */
const settleFastOmittedColumns = new Set<string>()

async function updatePosOrderSettleFastPatch(id: number, patch: Record<string, unknown>): Promise<void> {
  const working: Record<string, unknown> = { ...patch }
  for (const col of settleFastOmittedColumns) {
    delete working[col]
  }
  for (let i = 0; i < 40; i++) {
    try {
      await supabaseUpdateByFilter('pos_orders', `id=eq.${id}`, working)
      return
    } catch (e) {
      const missingCol = extractAnyMissingColumn(e)
      if (!missingCol || !(missingCol in working)) throw e
      settleFastOmittedColumns.add(missingCol)
      delete working[missingCol]
      console.warn(`settlePosOrderPaymentFast: skip missing column '${missingCol}'`)
    }
  }
  throw new Error('settlePosOrderPaymentFast: too many missing-column retries')
}

function parseItemsJsonForSettleFast(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[]
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}

/**
 * 합석·QR 등 DB total이 매장 요금(봉사료·VAT·정수 바트)과 다를 때,
 * 결제 모달 합계와 맞으면 통과하고 total을 맞춘다. 불일치 결제만 거부.
 */
async function alignSettleFastTotalIfPaymentMatchesRecomputedDue(params: {
  orderId: number
  storeCode: string
  body: Record<string, unknown>
  paymentCard: number
  nextPaymentSum: number
  dbTotal: number
  dbVat?: number
  dbServiceAmt?: number
}): Promise<{ total: number; vat: number; serviceAmt: number } | null> {
  try {
    const roundedDb = resolveAlignedDueTotal(params.nextPaymentSum, params.dbTotal)
    const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${params.orderId}`, {
      limit: 1,
      select: 'items_json,discount_amt,coupon_discount_amt,point_used',
    })) as {
      items_json?: unknown
      discount_amt?: number
      coupon_discount_amt?: number
      point_used?: number
    }[] | null
    const row = rows?.[0]
    const items = parseItemsJsonForSettleFast(row?.items_json)
    const discountAmt = Math.max(
      0,
      Number(params.body?.discountAmt ?? params.body?.discount_amt ?? row?.discount_amt ?? 0) || 0
    )
    const pointUsed = Math.max(
      0,
      Number(params.body?.pointUsed ?? params.body?.point_used ?? row?.point_used ?? 0) || 0
    )
    const couponDiscountAmt = Math.max(
      0,
      Number(
        params.body?.couponDiscountAmt ?? params.body?.coupon_discount_amt ?? row?.coupon_discount_amt ?? 0
      ) || 0
    )
    const fromBody = coercePosPricingAdjustmentsFromBody(params.body?.pricingAdjustments)
    const fromStore = await loadPosPricingAdjustmentsForStore(params.storeCode)
    const attempts = fromBody ? [fromBody, fromStore] : [fromStore]
    if (items.length) {
      for (const adjustments of attempts) {
        const aligned = alignPaymentToRecomputedDue({
          items,
          paymentSum: params.nextPaymentSum,
          paymentCard: params.paymentCard,
          discountAmt,
          couponDiscountAmt,
          pointUsed,
          adjustments,
        })
        if (aligned) return aligned
      }
    }
    if (roundedDb != null) {
      return {
        total: roundedDb,
        vat: Math.max(0, Number(params.dbVat ?? 0) || 0),
        serviceAmt: Math.max(0, Number(params.dbServiceAmt ?? 0) || 0),
      }
    }
    return null
  } catch (e) {
    console.warn('settlePosOrderPaymentFast align total:', e)
    return null
  }
}

export async function settlePosOrderPaymentFast(params: {
  auth: JwtPayload
  body: Record<string, unknown>
  fromOfflineQueueSync: boolean
  idempotencyKey: string
}): Promise<NextResponse> {
  const headers = posApiCorsHeaders()
  const { auth, body, fromOfflineQueueSync, idempotencyKey } = params
  const id = Number(body?.id)
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ success: false, message: 'id required' }, { headers })
  }

  const idempotencyScope = `update_pos_order:${id}`
  let idempotencyReserved = false
  if (idempotencyKey) {
    const duplicated = await reserveRequestIdempotencyKey({
      scope: idempotencyScope,
      key: idempotencyKey,
      payload: { id, source: fromOfflineQueueSync ? 'offline_queue' : 'api', settleFast: true },
    })
    if (duplicated) {
      return NextResponse.json({ success: true, noop: true, duplicate: true }, { headers })
    }
    idempotencyReserved = true
  }

  const releaseIdempotencyOnFailure = async () => {
    if (!idempotencyReserved || !idempotencyKey) return
    await releaseRequestIdempotencyKey({ scope: idempotencyScope, key: idempotencyKey })
    idempotencyReserved = false
  }

  try {
    return await settlePosOrderPaymentFastBody({
      auth,
      body,
      fromOfflineQueueSync,
      id,
      headers,
      releaseIdempotencyOnFailure,
    })
  } catch (e) {
    await releaseIdempotencyOnFailure()
    console.error('settlePosOrderPaymentFast:', e)
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

async function settlePosOrderPaymentFastBody(params: {
  auth: JwtPayload
  body: Record<string, unknown>
  fromOfflineQueueSync: boolean
  id: number
  headers: HeadersInit
  releaseIdempotencyOnFailure: () => Promise<void>
}): Promise<NextResponse> {
  const { auth, body, fromOfflineQueueSync, id, headers, releaseIdempotencyOnFailure } = params

  const existing = (await supabaseSelectFilterStrippingUnknownColumns(
    'pos_orders',
    `id=eq.${id}`,
    {
      limit: 1,
      select:
        'id,order_no,store_code,status,order_type,table_name,memo,total,vat,service_amt,payment_cash,payment_card,payment_qr,payment_other,payment_other_breakdown,payment_delivery_app,payment_crypto,delivery_payment_channel,delivery_app_code,member_id,member_no,coupon_code,coupon_discount_amt,applied_coupons,point_used,point_earned,guest_count,paid_at',
    },
    'settlePosOrderPaymentFast'
  )) as {
    id?: number
    order_no?: string
    store_code?: string
    status?: string
    order_type?: string
    table_name?: string
    memo?: string
    total?: number
    vat?: number
    service_amt?: number
    payment_cash?: number
    payment_card?: number
    payment_qr?: number
    payment_other?: number
    payment_other_breakdown?: unknown
    payment_delivery_app?: number
    payment_crypto?: number
    delivery_payment_channel?: string | null
    delivery_app_code?: string | null
    member_id?: number | null
    member_no?: string | null
    coupon_code?: string | null
    coupon_discount_amt?: number
    applied_coupons?: unknown
    point_used?: number
    point_earned?: number
    guest_count?: number
    paid_at?: string | null
  }[] | null

  if (!existing?.length) {
    await releaseIdempotencyOnFailure()
    return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
  }
  const current = existing[0]

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
  let paymentCrypto = Math.max(0, Number(body?.paymentCrypto ?? body?.payment_crypto ?? 0))

  const incomingPaymentSum = posOrderPaymentSumFromAmounts({
    paymentCash,
    paymentCard,
    paymentQr,
    paymentOther,
    paymentDeliveryApp,
    paymentCrypto,
  })
  const existingPaymentSum = posOrderPaymentSumFromAmounts({
    paymentCash: Number(current?.payment_cash ?? 0),
    paymentCard: Number(current?.payment_card ?? 0),
    paymentQr: Number(current?.payment_qr ?? 0),
    paymentOther: Number(current?.payment_other ?? 0),
    paymentDeliveryApp: Number(current?.payment_delivery_app ?? 0),
    paymentCrypto: Number(current?.payment_crypto ?? 0),
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
    paymentCrypto = preserved.paymentCrypto
  }

  if (!(await authCanAccessPosStoreWrite(auth, String(current?.store_code ?? '')))) {
    await releaseIdempotencyOnFailure()
    return NextResponse.json(
      { success: false, message: '해당 매장에 대한 권한이 없습니다.' },
      { status: 403, headers }
    )
  }

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
    await releaseIdempotencyOnFailure()
    return NextResponse.json({ success: false, message: closedMsg }, { headers })
  }

  let total = Math.max(0, Number(current?.total ?? 0))
  const serviceAmt = Math.max(0, Number(current?.service_amt ?? body?.serviceAmt ?? 0))
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

  const previousPaymentSum = existingPaymentSum
  let nextPaymentSum =
    paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryAppFinal + paymentCrypto
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
        paymentCrypto,
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
      paymentCrypto = reconciled.payment.paymentCrypto
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
        paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryAppFinal + paymentCrypto
    }
  }

  let settleFastAlignedDue: { total: number; vat: number; serviceAmt: number } | null = null
  if (total > 0.02 && nextPaymentSum > total + 0.02) {
    const aligned = await alignSettleFastTotalIfPaymentMatchesRecomputedDue({
      orderId: id,
      storeCode: String(current?.store_code ?? ''),
      body,
      paymentCard,
      nextPaymentSum,
      dbTotal: total,
      dbVat: Math.max(0, Number(current?.vat ?? 0) || 0),
      dbServiceAmt: serviceAmt,
    })
    if (aligned && nextPaymentSum <= aligned.total + 0.02) {
      settleFastAlignedDue = aligned
      total = aligned.total
    } else {
      await releaseIdempotencyOnFailure()
      return NextResponse.json(
        { success: false, message: 'payment_exceeds_total' },
        { headers }
      )
    }
  }

  const linkposPayment =
    body?.linkposPayment && typeof body.linkposPayment === 'object'
      ? (body.linkposPayment as Record<string, unknown>)
      : null

  const paidAtStamp = resolvePosOrderPaidAtStampIso({
    existingPaidAt: current?.paid_at,
    total,
    previousPaymentSum,
    nextPaymentSum,
    linkposRespondedAt: linkposPayment ? String(linkposPayment.respondedAt ?? '') : null,
  })

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
  const tableName = sanitizePosOrderTableNameForDb(current?.order_type, body?.tableName)
  const deliveryAppCode = String(
    body?.deliveryAppCode ?? body?.delivery_app_code ?? current?.delivery_app_code ?? ''
  )
    .trim()
    .toLowerCase()
  const deliveryPaymentChannel = resolveDeliveryPaymentChannelForSave({
    deliveryAppCode: deliveryAppCode || undefined,
    deliveryPaymentChannel:
      String(body?.deliveryPaymentChannel ?? body?.delivery_payment_channel ?? '').trim() || undefined,
    tableName,
    memo,
    orderNo: current?.order_no,
    paymentDeliveryApp: paymentDeliveryAppFinal,
  })

  const patch: Record<string, unknown> = {
    table_name: tableName,
    memo,
    payment_cash: paymentCash,
    payment_card: paymentCard,
    payment_qr: paymentQr,
    payment_other: paymentOther,
    payment_delivery_app: paymentDeliveryAppFinal,
    payment_crypto: paymentCrypto,
    member_id: memberId || null,
    member_no: memberNo || null,
    point_used: pointUsed,
  }
  /** tendered·breakdown·delivery channel 은 값 있을 때만 — 없는 컬럼 재시도 RTT 예방 */
  if (paymentCashTendered > 0.005) {
    patch.payment_cash_tendered = paymentCashTendered
  }
  if (paymentOther > 0.005 && paymentOtherBreakdownDb) {
    patch.payment_other_breakdown = paymentOtherBreakdownDb
  } else if (paymentOther <= 0.005) {
    patch.payment_other_breakdown = null
  }
  if (deliveryPaymentChannel) {
    patch.delivery_payment_channel = deliveryPaymentChannel
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
    patch.linkpos_requested_at = nullableTimestamptz(linkposPayment.requestedAt)
    patch.linkpos_responded_at = nullableTimestamptz(linkposPayment.respondedAt)
  }

  const guestCountBody = body?.guestCount ?? body?.guest_count
  if (guestCountBody !== undefined && guestCountBody !== null) {
    const g = Math.trunc(Number(guestCountBody))
    if (!Number.isNaN(g) && isDineInOrderTypeForGuestCount(current?.order_type)) {
      patch.guest_count = Math.max(0, Math.min(99, g))
    }
  }

  /**
   * body.items 는 무시한다.
   * 결제 UI는 항상 items 를 보내지만, enrich·total 재계산 없이 items_json 만 덮으면
   * 결제액/재고와 불일치가 난다. 품목은 주문·추가주문 저장 시점에 이미 DB에 있어야 한다.
   * 합석 직후 DB total이 결제 모달보다 낮으면 위에서 재계산한 due로 total만 맞춘다.
   */
  if (settleFastAlignedDue) {
    patch.total = settleFastAlignedDue.total
    patch.vat = settleFastAlignedDue.vat
    patch.service_amt = settleFastAlignedDue.serviceAmt
  }

  await updatePosOrderSettleFastPatch(id, patch)

  if (linkposPayment) {
    void supabaseInsert('pos_payment_attempts', {
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
    }).catch((e) => console.error('settlePosOrderPaymentFast linkpos attempt:', e))
  }

  const paymentSum = nextPaymentSum
  const appliedFromDb = parseAppliedCouponsFromBody(current?.applied_coupons)
  const preCouponSum = appliedFromDb.reduce((s, row) => s + Math.max(0, Number(row.discountAmt ?? 0) || 0), 0)
  const paymentComplete = isPosOrderCouponPaymentSettled({
    total,
    paymentSum,
    preCouponSum,
    appliedPreCount: appliedFromDb.length,
    paidAtStamp,
  })

  /** 감사·쿠폰은 응답 후 — UI 잠금에 묶지 않음 */
  void (async () => {
    try {
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
        before: {
          payment_cash: current?.payment_cash ?? 0,
          payment_card: current?.payment_card ?? 0,
          payment_qr: current?.payment_qr ?? 0,
          payment_other: current?.payment_other ?? 0,
          payment_delivery_app: current?.payment_delivery_app ?? 0,
          member_id: current?.member_id ?? null,
          paid_at: current?.paid_at ?? null,
        },
        after: {
          payment_cash: paymentCash,
          payment_card: paymentCard,
          payment_qr: paymentQr,
          payment_other: paymentOther,
          payment_delivery_app: paymentDeliveryAppFinal,
          member_id: memberId || null,
          paid_at: paidAtStamp ?? current?.paid_at ?? null,
        },
        reason: 'payment_settle_fast',
      })
    } catch (e) {
      console.error('settlePosOrderPaymentFast audit:', e)
    }
    if (!paymentComplete) return
    try {
      let couponsForRedeem = appliedFromDb
      if (!couponsForRedeem.length) {
        const legacyCode = String(current?.coupon_code ?? '').trim().toUpperCase()
        const legacyAmt = Math.max(0, Number(current?.coupon_discount_amt ?? 0))
        if (legacyCode) {
          couponsForRedeem = [{ code: legacyCode, name: legacyCode, discountAmt: legacyAmt, quantity: 1 }]
        }
      }
      if (couponsForRedeem.length > 0) {
        await persistPosOrderCouponRedemptions({
          orderId: id,
          storeCode: String(current?.store_code ?? '').trim(),
          appliedCoupons: couponsForRedeem,
          memberId: memberId || undefined,
        })
      }
      await redeemMemberCouponIssuesForPaidOrder(id)
    } catch (e) {
      console.error('settlePosOrderPaymentFast coupon:', e)
    }
  })()

  return NextResponse.json(
    {
      success: true,
      settleFast: true,
      pointEarned: Number(current?.point_earned || 0),
      ...(memberId > 0 ? { memberId } : {}),
      ...(memberNo ? { memberNo } : {}),
    },
    { headers }
  )
}
