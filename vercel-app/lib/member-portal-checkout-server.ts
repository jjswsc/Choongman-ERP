import { fetchErpStoresMaster } from '@/lib/erp-store-master'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { resolveMemberPortalPointAndQr } from '@/lib/member-portal-checkout-amounts'
import {
  loadMemberPortalPrepayConfig,
  MEMBER_PORTAL_PREPAY_MIN_QR_BAHT,
  MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS,
  type MemberPortalPrepayConfig,
} from '@/lib/member-portal-prepay-config'
import { assertMemberPickupTimeAllowed } from '@/lib/member-portal-pickup-time'
import { resolveMemberPortalPickupMinLeadMinutes } from '@/lib/member-portal-pickup-settings'
import { generateMemberPortalKbankQr } from '@/lib/member-portal-kbank-qr'
import { applyLoyaltyOnOrder, type MemberSummary } from '@/lib/members-server'
import { buildMemberPortalTakeoutTableNameForStorage } from '@/lib/pos-member-portal-takeout-label'
import { computePosPricing } from '@/lib/pos-pricing'
import { coercePosOrderTypeForDb } from '@/lib/pos-sales-order-type-filter'
import { allocateNextPosOrderNo } from '@/lib/pos-order-no-server'
import { enrichOrderItemsWithOptionCode } from '@/lib/pos-option-code-enrich'
import { isMemberPortalPublicStore } from '@/lib/member-portal-stores'
import { isMemberPortalPrepayStore } from '@/lib/member-portal-prepay-config'
import { resolvePosOrderPaidAtStampIso } from '@/lib/pos-order-paid-at'
import { checkKbankQrStatus } from '@/lib/payments/kbank-client'
import { normalizeKbankTxnStatusToPos } from '@/lib/payments/kbank-api-reference'
import { supabaseInsertWithPgrst204Fallback } from '@/lib/supabase-pgrst204-retry'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { resolveMemberPortalCheckoutCoupons } from '@/lib/member-portal-checkout-coupons'
import { persistPosOrderCouponRedemptions } from '@/lib/pos-coupon-server'
import type { PosAppliedCouponLine } from '@/lib/pos-coupon-domain'

import type { MemberPickupOrderItem } from '@/lib/member-portal-order-server'

export type MemberPortalCheckoutPreview = {
  prepayEnabled: boolean
  subtotal: number
  packagingFee: number
  vat: number
  couponCode: string
  couponDiscountAmt: number
  totalBeforePoints: number
  pointBalance: number
  maxPointUsable: number
  pointUsed: number
  qrAmount: number
  requiresQr: boolean
  finalTotal: number
}

type ResolvedCheckoutPricing = MemberPortalCheckoutPreview & {
  appliedCoupons: PosAppliedCouponLine[]
  appliedCouponsJson: PosAppliedCouponLine[] | null
}

import {
  MEMBER_PORTAL_PAYMENT_EXPIRED_TAG,
  MEMBER_PORTAL_PAYMENT_PENDING_TAG,
  stripMemberPortalPaymentPendingTag,
} from '@/lib/member-portal-payment-pending'

async function resolveStoreContext(storeCode: string) {
  const code = String(storeCode || '').trim()
  try {
    const rows = await fetchErpStoresMaster()
    const hit = rows.find((r) => String(r.store_code || '').trim() === code)
    const displayName = String(hit?.display_name || code).trim()
    return { storeCode: code, displayName }
  } catch {
    return { storeCode: code, displayName: code }
  }
}

async function loadStorePackagingFee(storeCode: string): Promise<number> {
  try {
    const rows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1, select: 'packaging_fee' }
    )) as { packaging_fee?: number | null }[] | null
    return Math.max(0, Number(rows?.[0]?.packaging_fee ?? 0))
  } catch {
    return 0
  }
}

async function normalizePickupItems(itemsIn: MemberPickupOrderItem[]) {
  return enrichOrderItemsWithOptionCode(
    itemsIn.map((it) => {
      const optionIdRaw = String(it.optionId || '').trim()
      const optionId = /^\d+$/.test(optionIdRaw) ? optionIdRaw : undefined
      const optionCode = String(it.optionCode || '').trim() || undefined
      return {
        menuId: String(it.menuId || ''),
        ...(optionId ? { optionId } : {}),
        ...(optionCode ? { optionCode } : {}),
        code: it.code,
        name: String(it.name || '').trim(),
        price: Math.max(0, Number(it.price || 0)),
        qty: Math.max(1, Math.trunc(Number(it.qty || 1))),
      }
    })
  )
}

function calcSubtotal(items: Array<{ price?: number; qty?: number }>): number {
  let subtotal = 0
  for (const it of items) {
    subtotal += Number(it.price || 0) * Math.max(1, Math.trunc(Number(it.qty || 1)))
  }
  return subtotal
}

async function resolveMemberPortalCheckoutPricing(params: {
  member: MemberSummary
  storeCode: string
  items: MemberPickupOrderItem[]
  requestedPointUsed?: number
  couponCode?: string
  prepayConfig?: MemberPortalPrepayConfig
}): Promise<ResolvedCheckoutPricing> {
  const prepayConfig = params.prepayConfig ?? (await loadMemberPortalPrepayConfig())
  const storeCode = String(params.storeCode || '').trim()
  const storeCtx = await resolveStoreContext(storeCode)
  const prepayEnabled = isMemberPortalPrepayStore(storeCtx, prepayConfig)
  const itemsIn = (params.items || []).filter((it) => it.qty > 0)
  const items = await normalizePickupItems(itemsIn)
  const subtotal = calcSubtotal(items)
  const packagingFee = await loadStorePackagingFee(storeCode)

  let couponCode = ''
  let couponDiscountAmt = 0
  let appliedCoupons: PosAppliedCouponLine[] = []
  let appliedCouponsJson: PosAppliedCouponLine[] | null = null
  const couponInput = String(params.couponCode || '').trim()
  if (couponInput && prepayEnabled) {
    const coupon = await resolveMemberPortalCheckoutCoupons({
      memberId: params.member.id,
      subtotal,
      items: itemsIn,
      couponCode: couponInput,
    })
    couponCode = coupon.couponCode
    couponDiscountAmt = coupon.couponDiscountAmt
    appliedCoupons = coupon.appliedCoupons
    appliedCouponsJson = coupon.appliedCouponsJson
  }

  const pricingAfterCoupon = computePosPricing({
    subtotal,
    discountAmt: couponDiscountAmt,
    deliveryFee: 0,
    packagingFee,
    cardPaymentAmount: 0,
  })
  const totalBeforePoints = pricingAfterCoupon.finalTotal
  const pointBalance = Math.max(0, Math.trunc(Number(params.member.pointBalance || 0)))
  const maxPointUsable = Math.min(pointBalance, Math.trunc(totalBeforePoints))
  const split = resolveMemberPortalPointAndQr({
    totalBeforePoints,
    pointBalance,
    requestedPointUsed: prepayEnabled ? Number(params.requestedPointUsed || 0) : 0,
  })
  const pricingFinal = computePosPricing({
    subtotal,
    discountAmt: couponDiscountAmt + split.pointUsed,
    deliveryFee: 0,
    packagingFee,
    cardPaymentAmount: 0,
  })

  return {
    prepayEnabled,
    subtotal,
    packagingFee,
    vat: pricingFinal.vatFeeAmt,
    couponCode,
    couponDiscountAmt,
    totalBeforePoints,
    pointBalance,
    maxPointUsable,
    pointUsed: split.pointUsed,
    qrAmount: split.qrAmount,
    requiresQr: split.requiresQr,
    finalTotal: pricingFinal.finalTotal,
    appliedCoupons,
    appliedCouponsJson,
  }
}

export async function buildMemberPortalCheckoutPreview(params: {
  member: MemberSummary
  storeCode: string
  items: MemberPickupOrderItem[]
  requestedPointUsed?: number
  couponCode?: string
  prepayConfig?: MemberPortalPrepayConfig
}): Promise<MemberPortalCheckoutPreview> {
  const resolved = await resolveMemberPortalCheckoutPricing(params)
  const { appliedCoupons: _a, appliedCouponsJson: _j, ...preview } = resolved
  return preview
}

function assertStoreOrderable(
  storeCode: string,
  displayName: string,
  prepayConfig: MemberPortalPrepayConfig
) {
  if (!storeCode) throw new Error('store_required')
  const store = { storeCode, displayName }
  if (isMemberPortalPublicStore(store)) return
  if (isMemberPortalPrepayStore(store, prepayConfig)) return
  throw new Error('store_not_available')
}

async function redeemMemberPortalOrderCoupons(orderId: number): Promise<void> {
  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
    limit: 1,
    select: 'id,store_code,member_id,coupon_code,applied_coupons,created_by',
  })) as Array<{
    id?: number
    store_code?: string
    member_id?: number | null
    coupon_code?: string | null
    applied_coupons?: unknown
    created_by?: string | null
  }>
  const order = rows?.[0]
  if (!order?.id || !String(order.created_by || '').startsWith('member_portal:')) return
  const storeCode = String(order.store_code || '').trim()
  if (!storeCode) return

  let applied: PosAppliedCouponLine[] = []
  const raw = order.applied_coupons
  if (Array.isArray(raw)) {
    applied = raw as PosAppliedCouponLine[]
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) applied = parsed as PosAppliedCouponLine[]
    } catch {
      /* ignore */
    }
  }
  if (!applied.length && String(order.coupon_code || '').trim()) {
    applied = [
      {
        code: String(order.coupon_code || '').trim().toUpperCase(),
        name: String(order.coupon_code || '').trim().toUpperCase(),
        discountAmt: 0,
        quantity: 1,
      },
    ]
  }
  if (!applied.length) return

  await persistPosOrderCouponRedemptions({
    orderId,
    storeCode,
    appliedCoupons: applied,
    memberId: Number(order.member_id || 0) || undefined,
  })
}

export async function finalizeMemberPortalPrepaidOrder(params: {
  orderId: number
  paymentQr: number
  partnerTransactionId?: string
}): Promise<{ ok: boolean; alreadyPaid?: boolean }> {
  const orderId = Number(params.orderId || 0)
  if (!orderId) return { ok: false }

  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
    limit: 1,
    select:
      'id,order_no,store_code,status,total,subtotal,member_id,member_no,point_used,point_earned,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,paid_at,coupon_code,created_by,memo',
  })) as Array<{
    id?: number
    order_no?: string
    status?: string
    total?: number
    member_id?: number | null
    member_no?: string | null
    point_used?: number | null
    point_earned?: number | null
    payment_cash?: number | null
    payment_card?: number | null
    payment_qr?: number | null
    payment_other?: number | null
    payment_delivery_app?: number | null
    paid_at?: string | null
    coupon_code?: string | null
    created_by?: string | null
    memo?: string | null
  }>
  const order = rows?.[0]
  if (!order?.id) return { ok: false }

  const createdBy = String(order.created_by || '')
  if (!createdBy.startsWith('member_portal:')) return { ok: false }

  const status = String(order.status || '').trim().toLowerCase()
  if (status === 'paid' || status === 'completed') {
    return { ok: true, alreadyPaid: true }
  }

  const total = Math.max(0, Number(order.total || 0))
  const paymentQr = Math.max(0, Number(params.paymentQr || 0))
  const previousSum =
    Math.max(0, Number(order.payment_cash || 0)) +
    Math.max(0, Number(order.payment_card || 0)) +
    Math.max(0, Number(order.payment_qr || 0)) +
    Math.max(0, Number(order.payment_other || 0)) +
    Math.max(0, Number(order.payment_delivery_app || 0))
  const nextSum = previousSum + paymentQr

  const paidAtStamp = resolvePosOrderPaidAtStampIso({
    existingPaidAt: order.paid_at ?? null,
    total,
    previousPaymentSum: previousSum,
    nextPaymentSum: nextSum,
  })

  const patch: Record<string, unknown> = {
    payment_qr: Math.max(0, Number(order.payment_qr || 0)) + paymentQr,
    status: 'paid',
  }
  if (paidAtStamp) patch.paid_at = paidAtStamp

  await supabaseUpdateByFilter('pos_orders', `id=eq.${orderId}`, patch)

  const memo = String(order.memo || '')
  if (memo.includes(MEMBER_PORTAL_PAYMENT_PENDING_TAG)) {
    const nextMemo = stripMemberPortalPaymentPendingTag(memo)
    if (nextMemo !== memo) {
      await supabaseUpdateByFilter('pos_orders', `id=eq.${orderId}`, {
        memo: nextMemo,
        updated_at: getBangkokDateTimeString(),
      })
    }
  }

  const memberId = Number(order.member_id || 0)
  const pointUsed = Math.max(0, Math.trunc(Number(order.point_used || 0)))
  if (memberId > 0) {
    const loyalty = await applyLoyaltyOnOrder({
      memberId,
      orderId,
      totalAmount: total,
      pointUsed,
      pointEarned: Math.max(0, Math.trunc(Number(order.point_earned || 0))),
      orderNo: String(order.order_no || ''),
      couponCode: String(order.coupon_code || '').trim() || undefined,
    })
    await supabaseUpdateByFilter('pos_orders', `id=eq.${orderId}`, {
      point_earned: loyalty.pointEarned,
    })
  }

  await redeemMemberPortalOrderCoupons(orderId)

  void params.partnerTransactionId
  return { ok: true }
}

export async function finalizeMemberPortalPointsOnlyOrder(orderId: number): Promise<void> {
  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
    limit: 1,
    select: 'id,order_no,total,member_id,point_used,point_earned,coupon_code,created_by,paid_at',
  })) as Array<{
    id?: number
    order_no?: string
    total?: number
    member_id?: number | null
    point_used?: number | null
    point_earned?: number | null
    coupon_code?: string | null
    created_by?: string | null
    paid_at?: string | null
  }>
  const order = rows?.[0]
  if (!order?.id) throw new Error('order_not_found')
  if (!String(order.created_by || '').startsWith('member_portal:')) return

  const paidAt = String(order.paid_at || '').trim() || getBangkokDateTimeString()
  await supabaseUpdateByFilter('pos_orders', `id=eq.${orderId}`, {
    status: 'paid',
    paid_at: paidAt,
  })

  const memberId = Number(order.member_id || 0)
  if (memberId > 0) {
    const loyalty = await applyLoyaltyOnOrder({
      memberId,
      orderId,
      totalAmount: Math.max(0, Number(order.total || 0)),
      pointUsed: Math.max(0, Math.trunc(Number(order.point_used || 0))),
      pointEarned: Math.max(0, Math.trunc(Number(order.point_earned || 0))),
      orderNo: String(order.order_no || ''),
      couponCode: String(order.coupon_code || '').trim() || undefined,
    })
    await supabaseUpdateByFilter('pos_orders', `id=eq.${orderId}`, {
      point_earned: loyalty.pointEarned,
    })
  }

  await redeemMemberPortalOrderCoupons(orderId)
}

export async function createMemberPickupOrderWithPrepay(params: {
  member: MemberSummary
  storeCode: string
  pickupAt: string
  items: MemberPickupOrderItem[]
  pointUsed?: number
  couponCode?: string
  prepayConfig?: MemberPortalPrepayConfig
}): Promise<{
  orderId: number
  orderNo: string
  paid: boolean
  requiresQr: boolean
  qrAmount: number
  pointUsed: number
  total: number
  createdAt?: string
  paymentExpiresAt?: string
}> {
  const prepayConfig = params.prepayConfig ?? (await loadMemberPortalPrepayConfig())
  const storeCode = String(params.storeCode || '').trim()
  const storeCtx = await resolveStoreContext(storeCode)
  assertStoreOrderable(storeCtx.storeCode, storeCtx.displayName, prepayConfig)

  const itemsIn = (params.items || []).filter((it) => it.qty > 0 && String(it.name || '').trim())
  if (itemsIn.length === 0) throw new Error('empty_cart')

  const pickupLabel = assertMemberPickupTimeAllowed(
    params.pickupAt,
    await resolveMemberPortalPickupMinLeadMinutes(storeCode)
  )
  const member = params.member
  const memberName = String(member.fullName || member.name || '').trim()
  const memberNo = String(member.memberNo || `M${member.id}`).trim()
  const prepayEnabled = isMemberPortalPrepayStore(storeCtx, prepayConfig)

  const preview = await resolveMemberPortalCheckoutPricing({
    member,
    storeCode,
    items: itemsIn,
    requestedPointUsed: prepayEnabled ? params.pointUsed : 0,
    couponCode: prepayEnabled ? params.couponCode : undefined,
    prepayConfig,
  })

  const items = await normalizePickupItems(itemsIn)
  const pricing = computePosPricing({
    subtotal: preview.subtotal,
    discountAmt: preview.couponDiscountAmt + preview.pointUsed,
    deliveryFee: 0,
    packagingFee: preview.packagingFee,
    cardPaymentAmount: 0,
  })

  const paymentPending = prepayEnabled && preview.requiresQr
  const memoParts = [
    '[회원주문]',
    paymentPending ? MEMBER_PORTAL_PAYMENT_PENDING_TAG : null,
    '회원 주문입니다',
    `픽업희망:${pickupLabel.slice(0, 16)}`,
    memberName ? `회원:${memberName}` : '',
    memberNo ? `번호:${memberNo}` : '',
    preview.pointUsed > 0 ? `포인트:${preview.pointUsed}` : '',
    preview.couponCode ? `쿠폰:${preview.couponCode}` : '',
  ].filter(Boolean)

  const orderNo = await allocateNextPosOrderNo(storeCode)
  const orderType = coercePosOrderTypeForDb('takeout')
  const paidByPointsOnly = prepayEnabled && !preview.requiresQr && preview.finalTotal <= 0.0001

  const row = {
    order_no: orderNo,
    store_code: storeCode,
    order_type: orderType,
    table_name: buildMemberPortalTakeoutTableNameForStorage(memberName, memberNo),
    memo: memoParts.join(' · '),
    discount_amt: preview.couponDiscountAmt + preview.pointUsed,
    coupon_code: preview.couponCode || null,
    coupon_discount_amt: preview.couponDiscountAmt,
    applied_coupons: preview.appliedCouponsJson,
    delivery_fee: 0,
    packaging_fee: preview.packagingFee,
    items_json: JSON.stringify(items),
    subtotal: preview.subtotal,
    vat: pricing.vatFeeAmt,
    total: pricing.finalTotal,
    status: paidByPointsOnly ? 'paid' : 'pending',
    payment_cash: 0,
    payment_card: 0,
    payment_qr: 0,
    payment_other: 0,
    payment_delivery_app: 0,
    member_id: member.id,
    member_no: memberNo,
    point_used: preview.pointUsed,
    point_earned: 0,
    guest_count: 0,
    created_by: `member_portal:${member.id}`,
    ...(paidByPointsOnly ? { paid_at: getBangkokDateTimeString() } : {}),
  }

  const inserted = (await supabaseInsertWithPgrst204Fallback(
    'pos_orders',
    row,
    'memberPortalPickupOrder'
  )) as { id?: number }[]
  const created = inserted?.[0]
  if (!created?.id) throw new Error('order_create_failed')
  const orderId = Number(created.id)
  const createdAt = getBangkokDateTimeString()
  const paymentExpiresAt =
    paymentPending && prepayEnabled
      ? new Date(Date.now() + MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS).toISOString()
      : undefined

  if (paidByPointsOnly) {
    await finalizeMemberPortalPointsOnlyOrder(orderId)
  }

  return {
    orderId,
    orderNo,
    paid: paidByPointsOnly,
    requiresQr: prepayEnabled && preview.requiresQr,
    qrAmount: preview.qrAmount,
    pointUsed: preview.pointUsed,
    total: pricing.finalTotal,
    createdAt,
    paymentExpiresAt,
  }
}

export async function issueMemberPortalOrderQr(params: {
  member: MemberSummary
  orderId: number
}): Promise<{
  ok: boolean
  partnerTransactionId?: string
  qrPayload?: string
  qrAmount?: number
  paymentExpiresAt?: string
  message?: string
}> {
  const orderId = Number(params.orderId || 0)
  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
    limit: 1,
    select: 'id,store_code,status,total,member_id,point_used,payment_qr,created_by,created_at,memo',
  })) as Array<{
    id?: number
    store_code?: string
    status?: string
    total?: number
    member_id?: number | null
    point_used?: number | null
    payment_qr?: number | null
    created_by?: string | null
    created_at?: string | null
    memo?: string | null
  }>
  const order = rows?.[0]
  if (!order?.id) return { ok: false, message: 'order_not_found' }
  if (Number(order.member_id || 0) !== Number(params.member.id)) {
    return { ok: false, message: 'order_forbidden' }
  }
  if (!String(order.created_by || '').startsWith('member_portal:')) {
    return { ok: false, message: 'order_forbidden' }
  }
  const status = String(order.status || '').trim().toLowerCase()
  if (status === 'paid' || status === 'completed') {
    return { ok: false, message: 'already_paid' }
  }
  if (status === 'cancelled' || status === 'canceled') {
    return { ok: false, message: 'order_expired' }
  }

  const total = Math.max(0, Number(order.total || 0))
  const paidQr = Math.max(0, Number(order.payment_qr || 0))
  const qrAmount = Math.round((total - paidQr) * 100) / 100
  if (qrAmount < MEMBER_PORTAL_PREPAY_MIN_QR_BAHT) {
    return { ok: false, message: 'qr_amount_invalid' }
  }

  const storeCode = String(order.store_code || '').trim()
  const gen = await generateMemberPortalKbankQr({
    amount: qrAmount,
    orderId,
    storeCode,
  })
  if (!gen.ok) {
    return { ok: false, message: gen.statusMessage || 'qr_generate_failed' }
  }
  const createdAt = String(order.created_at || '')
  const createdMs = createdAt ? new Date(createdAt).getTime() : NaN
  const paymentExpiresAt =
    Number.isFinite(createdMs) && createdMs > 0
      ? new Date(createdMs + MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS).toISOString()
      : new Date(Date.now() + MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS).toISOString()
  return {
    ok: true,
    partnerTransactionId: gen.partnerTransactionId,
    qrPayload: gen.qrPayload,
    qrAmount,
    paymentExpiresAt,
  }
}

function extractApprovedAmount(json: Record<string, unknown>): number {
  const candidates = [json.txnAmount, json.amount, json.transactionAmount, json.approvedAmount]
  for (const c of candidates) {
    const n = Number(c)
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100
  }
  const data = json.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const c of [d.txnAmount, d.amount, d.transactionAmount, d.approvedAmount]) {
      const n = Number(c)
      if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100
    }
  }
  return 0
}

export async function pollMemberPortalOrderPayment(params: {
  member: MemberSummary
  orderId: number
  partnerTransactionId: string
}): Promise<{ status: string; paid: boolean; message?: string }> {
  const orderId = Number(params.orderId || 0)
  const partnerTransactionId = String(params.partnerTransactionId || '').trim()
  if (!orderId || !partnerTransactionId) {
    return { status: 'invalid', paid: false, message: 'invalid_request' }
  }

  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
    limit: 1,
    select: 'id,status,member_id,created_by',
  })) as Array<{ id?: number; status?: string; member_id?: number | null; created_by?: string | null }>
  const order = rows?.[0]
  if (!order?.id || Number(order.member_id || 0) !== Number(params.member.id)) {
    return { status: 'forbidden', paid: false, message: 'order_forbidden' }
  }

  const curStatus = String(order.status || '').trim().toLowerCase()
  if (curStatus === 'paid' || curStatus === 'completed') {
    return { status: 'approved', paid: true }
  }
  if (curStatus === 'cancelled' || curStatus === 'canceled') {
    return { status: 'expired', paid: false, message: 'order_expired' }
  }

  const result = await checkKbankQrStatus({
    orderId,
    partnerTransactionId,
    originalTransactionId: partnerTransactionId,
    payload: { origPartnerTxnUid: partnerTransactionId },
  })
  const response =
    result.response && typeof result.response === 'object'
      ? (result.response as Record<string, unknown>)
      : {}
  const statusLabel = normalizeKbankTxnStatusToPos(
    response.txnStatus ?? response.status,
    response.statusCode
  )

  if (statusLabel === 'approved') {
    const approvedAmount = extractApprovedAmount(response)
    await finalizeMemberPortalPrepaidOrder({
      orderId,
      paymentQr: approvedAmount,
      partnerTransactionId,
    })
    return { status: 'approved', paid: true }
  }

  return { status: statusLabel || 'pending', paid: false }
}
