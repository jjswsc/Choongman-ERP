import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { supabaseInsertWithPgrst204Fallback } from '@/lib/supabase-pgrst204-retry'
import { applyLoyaltyOnOrder } from '@/lib/members-server'
import { computePosPricing } from '@/lib/pos-pricing'
import { coercePosOrderTypeForDb, sanitizePosOrderTableNameForDb } from '@/lib/pos-sales-order-type-filter'
import { parseDeliveryAppCodeFromItemsJson } from '@/lib/pos-delivery-order-meta'
import { upsertTaxRecipientFromOrderMemo } from '@/lib/pos-tax-invoice-recipients-server'
import { allocateNextPosOrderNo } from '@/lib/pos-order-no-server'
import { processPosStockDeduction } from '@/lib/pos-stock-deduction'
import { hasJournalForSource, postPosOrderJournal } from '@/lib/accounting-posting'
import { isPosCompletionStatus } from '@/lib/pos-order-policy'
import { resolvePosBusinessAccountingDateForStore } from '@/lib/pos-order-policy-server'
import { upsertPosVatLedgerDraft } from '@/lib/pos-ledger-drafts'
import {
  coercePaymentOtherBreakdownForSave,
  paymentOtherBreakdownForDb,
} from '@/lib/pos-payment-other-breakdown'
import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
import { enrichOrderItemsWithOptionCode } from '@/lib/pos-option-code-enrich-server'
import { enrichOrderItemsWithPromoRegularPrice } from '@/lib/pos-order-promo-regular-price-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { writePosOrderAuditTrail } from '@/lib/pos-order-audit'
import { resolvePosOrderPaidAtStampIso } from '@/lib/pos-order-paid-at'
import { resolveManualDiscountNetForOrderSave } from '@/lib/pos-order-save-discount'
import { enqueueKitchenPrintJob } from '@/lib/pos-print-job-queue'
import { buildKitchenJobCreateDedupeKey } from '@/lib/pos-kitchen-print-dedupe-key'
import {
  parseAppliedCouponsFromBody,
  persistPosOrderCouponRedemptions,
  resolvePosOrderCouponsForSave,
} from '@/lib/pos-coupon-server'
import { assertPosBusinessOpenForOrderSave } from '@/lib/pos-business-open-gate-server'
import { resolveDeliveryPaymentChannelForSave } from '@/lib/pos-delivery-platform'
import { normalizePosPaymentTender } from '@/lib/pos-payment-tender-normalize'
import { syncPosPaymentDeliveryAppToNetTotal } from '@/lib/pos-delivery-app-settlement-amount'
import { enrichPosOrderRowForSaaS } from '@/lib/pos-saas-schema-compat'

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
const idempotencyCache = new Map<string, { id: number; orderNo: string; at: number }>()

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

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

async function readIdempotencyHitFromDb(keyHash: string): Promise<{ id: number; orderNo: string } | null> {
  try {
    const rows = (await supabaseSelectFilter('pos_orders', `idempotency_key_hash=eq.${encodeURIComponent(keyHash)}`, {
      limit: 1,
      select: 'id,order_no',
    })) as { id?: number; order_no?: string }[] | null
    const hit = rows?.[0]
    if (!hit?.id) return null
    return { id: Number(hit.id), orderNo: String(hit.order_no ?? '') }
  } catch {
    return null
  }
}

function isIdempotencyUniqueViolation(e: unknown): boolean {
  const msg = String(e ?? '').toLowerCase()
  return (
    msg.includes('duplicate key value violates unique constraint') &&
    msg.includes('idempotency_key_hash')
  )
}

function isMissingServiceColumnsError(e: unknown): boolean {
  const msg = String(e ?? '').toLowerCase()
  return (
    (msg.includes('service_amt') || msg.includes('service_reason')) &&
    (msg.includes('column') || msg.includes('schema cache'))
  )
}

async function runCompletionSideEffects(params: {
  orderId: number
  orderNo: string
  storeCode: string
  total: number
  subtotal: number
  vat: number
  serviceAmount: number
  createdAtIso: string
  paymentCash: number
  paymentCard: number
  paymentQr: number
  paymentOther: number
  paymentDeliveryApp: number
  createdBy?: string
}): Promise<void> {
  const { orderId, orderNo, storeCode, total, subtotal, vat, serviceAmount, createdAtIso, createdBy } = params
  if (!storeCode) return
  const salesDate = await resolvePosBusinessAccountingDateForStore(createdAtIso, storeCode)
  try {
    const settings = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1, select: 'auto_stock_deduction' }
    )) as { auto_stock_deduction?: boolean }[] | null
    if (settings?.[0]?.auto_stock_deduction) {
      await processPosStockDeduction(orderId)
    }
  } catch (e) {
    console.error('savePosOrder processPosStockDeduction:', e)
  }

  try {
    const alreadyPosted = await hasJournalForSource('pos_order', orderId)
    if (!alreadyPosted) {
      await postPosOrderJournal({
        posOrderId: orderId,
        salesDate,
        total: Number(total || 0),
        vatAmount: Number(vat || 0),
        serviceAmount: Number(serviceAmount || 0),
        paymentCash: Number(params.paymentCash || 0),
        paymentCard: Number(params.paymentCard || 0),
        paymentQr: Number(params.paymentQr || 0),
        paymentOther: Number(params.paymentOther || 0),
        paymentDeliveryApp: Number(params.paymentDeliveryApp || 0),
        storeName: storeCode || undefined,
        memo: 'POS 주문 완료 자동분개',
      })
    }
  } catch (postingErr) {
    console.error('savePosOrder posting:', postingErr)
  }

  try {
    await upsertPosVatLedgerDraft({
      posOrderId: orderId,
      orderNo,
      storeCode,
      createdAtIso,
      subtotal,
      total,
      vatAmount: vat,
      createdBy,
    })
  } catch (vatErr) {
    console.error('savePosOrder vat draft:', vatErr)
  }
}

/** POS 주문 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const startedAtMs = Date.now()
  let allocateOrderNoMs = 0

  try {
    const auth = await getVerifiedAuth(req)
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
    const idempotencyHeader = String(req.headers.get('x-idempotency-key') ?? '').trim()
    const idempotencyBody = String(body.localOrderNo ?? body.local_order_no ?? '').trim()
    const idempotencyKey = idempotencyHeader || idempotencyBody
    const idempotencyKeyHash = idempotencyKey ? sha256Hex(idempotencyKey) : null
    if (idempotencyKey) {
      if (idempotencyKeyHash) {
        const dbHit = await readIdempotencyHitFromDb(idempotencyKeyHash)
        if (dbHit) {
          return NextResponse.json(
            { success: true, orderId: dbHit.id, orderNo: dbHit.orderNo, duplicate: true },
            { headers }
          )
        }
      }
      const hit = readIdempotencyHit(idempotencyKey)
      if (hit) {
        return NextResponse.json(
          { success: true, orderId: hit.id, orderNo: hit.orderNo, duplicate: true },
          { headers }
        )
      }
    }
    const storeCode = String(body.storeCode ?? '').trim()
    const orderType = coercePosOrderTypeForDb(
      String(body.orderType ?? body.order_type ?? '')
    )
    const tableName = sanitizePosOrderTableNameForDb(orderType, body.tableName)
    const memo = String(body.memo ?? '').trim()
    const discountAmt = Math.max(0, Number(body.discountAmt ?? 0))
    const discountReason = String(body.discountReason ?? '').trim()
    const serviceAmt = Math.max(0, Number(body.serviceAmt ?? body.service_amt ?? 0))
    const serviceReason = String(body.serviceReason ?? body.service_reason ?? '').trim()
    const deliveryFee = Math.max(0, Number(body.deliveryFee ?? 0))
    const packagingFee = Math.max(0, Number(body.packagingFee ?? 0))
    const paymentCash = Math.max(0, Number(body.paymentCash ?? 0))
    const paymentCashTendered = Math.max(0, Number(body.paymentCashTendered ?? body.payment_cash_tendered ?? 0))
    const paymentQrType = String(body.paymentQrType ?? body.payment_qr_type ?? '').trim()
    const normalizedTender = normalizePosPaymentTender({
      paymentCard: Number(body.paymentCard ?? 0),
      paymentQr: Number(body.paymentQr ?? 0),
      paymentQrType,
    })
    const paymentCard = normalizedTender.paymentCard
    const paymentQr = normalizedTender.paymentQr
    const paymentOther = Math.max(0, Number(body.paymentOther ?? 0))
    const paymentOtherBreakdown = coercePaymentOtherBreakdownForSave(
      paymentOther,
      body.paymentOtherBreakdown ?? body.payment_other_breakdown
    )
    const paymentOtherBreakdownDb = paymentOtherBreakdownForDb(paymentOtherBreakdown)
    const paymentDeliveryApp = Math.max(0, Number(body.paymentDeliveryApp ?? body.payment_delivery_app ?? 0))
    const memberId = Math.max(0, Number(body.memberId ?? 0))
    const memberNo = String(body.memberNo ?? '').trim()
    const pointUsed = Math.max(0, Math.trunc(Number(body.pointUsed ?? 0)))
    const pointEarnedReq = Math.max(0, Math.trunc(Number(body.pointEarned ?? 0)))
    const guestCountReq = Math.trunc(Number(body.guestCount ?? body.guest_count ?? 0))
    const itemsRaw = Array.isArray(body.items) ? body.items : []
    const itemsWithOption = await enrichOrderItemsWithOptionCode(itemsRaw)
    const items = await enrichOrderItemsWithPromoRegularPrice(itemsWithOption, orderType)
    const pricingAdjustments = body.pricingAdjustments || {}
    const createdBy = String(body.createdBy ?? body.created_by ?? '').trim()
    const linkposPayment =
      body.linkposPayment && typeof body.linkposPayment === 'object'
        ? (body.linkposPayment as Record<string, unknown>)
        : null
    const kbankPartnerTransactionId = String(
      body.kbankPartnerTransactionId ?? body.kbank_partner_transaction_id ?? ''
    ).trim().slice(0, 40)

    if (items.length === 0) {
      return NextResponse.json({ success: false, message: '주문 항목이 없습니다.' }, { headers })
    }

    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'store_required' }, { headers })
    }

    const openCheck = await assertPosBusinessOpenForOrderSave(storeCode)
    if (!openCheck.ok) {
      return NextResponse.json(
        { success: false, message: openCheck.message, retryAfterQueue: false },
        { headers }
      )
    }

    let subtotal = 0
    for (const it of items) {
      const price = Number(it.price ?? 0)
      const qty = resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown })
      subtotal += price * qty
    }

    let appliedPre = parseAppliedCouponsFromBody(body.appliedCoupons ?? body.applied_coupons)
    const legacyCouponCode = String(body.couponCode ?? body.coupon_code ?? '').trim().toUpperCase()
    const legacyCouponAmt = Math.max(0, Number(body.couponDiscountAmt ?? body.coupon_discount_amt ?? 0))
    if (!appliedPre.length && legacyCouponCode) {
      appliedPre = [{ code: legacyCouponCode, name: legacyCouponCode, discountAmt: legacyCouponAmt, quantity: 1 }]
    }
    const preCouponSum = appliedPre.reduce((s, row) => s + Math.max(0, Number(row.discountAmt ?? 0) || 0), 0)
    const discountAmtNet = resolveManualDiscountNetForOrderSave({ discountAmt, serviceAmt, items })
    const manualDiscountForCoupons = Math.max(0, discountAmtNet - preCouponSum)
    const collabDiscountAmt = Math.max(0, Number(body.collabDiscountAmt ?? body.collab_discount_amt ?? 0))
    const tierDiscountAmt = Math.max(0, Number(body.tierDiscountAmt ?? body.tier_discount_amt ?? 0))
    const memberTierCode =
      String(body.memberTierCode ?? body.member_tier_code ?? '').trim().toUpperCase() || null
    const couponResolved = await resolvePosOrderCouponsForSave({
      body,
      subtotal,
      manualDiscountAmt: Math.max(0, manualDiscountForCoupons - collabDiscountAmt - tierDiscountAmt),
      collabDiscountAmt,
      tierDiscountAmt,
      cartLines: items.map((it) => {
        const qty = resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown })
        const price = Number(it.price ?? 0)
        return {
          menuId: String((it as { menuId?: string; menu_id?: string }).menuId ?? (it as { menu_id?: string }).menu_id ?? '').trim() || undefined,
          categoryCode: String((it as { categoryCode?: string; category_code?: string }).categoryCode ?? (it as { category_code?: string }).category_code ?? '').trim() || undefined,
          quantity: qty,
          lineSubtotal: Math.max(0, price * qty),
        }
      }),
      memberId: memberId || undefined,
    })
    const couponCode = couponResolved.couponCode
    const couponDiscountAmt = couponResolved.couponDiscountAmt
    const appliedCoupons = couponResolved.appliedCoupons
    const discountAmtForPricing = Math.min(
      subtotal,
      Math.max(0, manualDiscountForCoupons + couponDiscountAmt)
    )
    const discountAmtNetFinal = Math.max(0, discountAmtForPricing - serviceAmt)

    const pricing = computePosPricing({
      subtotal,
      discountAmt: discountAmtForPricing,
      deliveryFee,
      packagingFee,
      cardPaymentAmount: paymentCard,
      adjustments: pricingAdjustments,
    })
    const vat = pricing.vatFeeAmt
    const total = pricing.finalTotal
    const paymentDeliveryAppFinal = syncPosPaymentDeliveryAppToNetTotal({
      paymentDeliveryApp,
      paymentCash,
      paymentCard,
      paymentQr,
      paymentOther,
      total,
    })
    const adj = pricingAdjustments as { cardRate?: number } | undefined
    const cardRateSnapshot = Math.max(0, Number(adj?.cardRate ?? 0) || 0)

    const paymentSumForStatus = paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryAppFinal
    const closeStatusRaw = String(body.closeStatus ?? body.close_status ?? '').trim().toLowerCase()
    const closeStatus =
      closeStatusRaw === 'paid' || closeStatusRaw === 'completed' ? closeStatusRaw : null
    if (
      total > 0.02 &&
      paymentSumForStatus > total + 0.02 &&
      (closeStatus === 'paid' || closeStatus === 'completed')
    ) {
      return NextResponse.json(
        { success: false, message: 'payment_exceeds_total' },
        { headers }
      )
    }
    let orderStatus = 'pending'
    if (total > 0 && paymentSumForStatus >= total - 0.02) {
      if (closeStatus === 'paid' || closeStatus === 'completed') {
        orderStatus = closeStatus
      }
    }
    const paidAtStamp = resolvePosOrderPaidAtStampIso({
      existingPaidAt: null,
      total,
      previousPaymentSum: 0,
      nextPaymentSum: paymentSumForStatus,
      linkposRespondedAt: linkposPayment ? String(linkposPayment.respondedAt ?? '') : null,
    })

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

    const deliveryPaymentChannel = resolveDeliveryPaymentChannelForSave({
      deliveryAppCode: delivery_app_code,
      deliveryPaymentChannel: String(body.deliveryPaymentChannel ?? body.delivery_payment_channel ?? '').trim() || undefined,
      tableName,
      memo,
      paymentDeliveryApp,
      itemDeliveryAppCodes: items.map((it) =>
        String((it as { deliveryAppCode?: string }).deliveryAppCode ?? '').trim() || undefined
      ),
    })

    const allocateStartMs = Date.now()
    const orderNo = await allocateNextPosOrderNo(storeCode)
    allocateOrderNoMs = Date.now() - allocateStartMs
    const row = enrichPosOrderRowForSaaS(
      {
      order_no: orderNo,
      store_code: storeCode,
      order_type: orderType,
      table_name: tableName,
      memo,
      discount_amt: discountAmtNetFinal,
      discount_reason: discountReason,
      tier_discount_amt: tierDiscountAmt,
      member_tier_code: memberTierCode,
      service_amt: serviceAmt,
      service_reason: serviceReason || null,
      delivery_fee: deliveryFee,
      packaging_fee: packagingFee,
      card_fee_amt: pricing.cardFeeAmt,
      card_fee_mode: pricing.cardFeeMode,
      card_rate: cardRateSnapshot,
      items_json: JSON.stringify(items),
      subtotal,
      vat,
      total,
      status: orderStatus,
      payment_cash: paymentCash,
      ...(paymentCashTendered > 0.005 ? { payment_cash_tendered: paymentCashTendered } : { payment_cash_tendered: 0 }),
      payment_card: paymentCard,
      payment_qr: paymentQr,
      payment_other: paymentOther,
      ...(paymentOther <= 0.005
        ? { payment_other_breakdown: null }
        : paymentOtherBreakdownDb
          ? { payment_other_breakdown: paymentOtherBreakdownDb }
          : {}),
      payment_delivery_app: paymentDeliveryAppFinal,
      delivery_payment_channel: deliveryPaymentChannel,
      member_id: memberId || null,
      member_no: memberNo || null,
      coupon_code: couponCode || null,
      coupon_discount_amt: couponDiscountAmt,
      applied_coupons: couponResolved.appliedCouponsJson,
      point_used: pointUsed,
      point_earned: pointEarnedReq,
      guest_count,
      delivery_app_code,
      created_by: createdBy,
      linkpos_provider: linkposPayment ? String(linkposPayment.provider ?? 'kbtg_linkpos') : null,
      linkpos_mode: linkposPayment ? String(linkposPayment.mode ?? 'hypercom') : null,
      linkpos_tx_code: linkposPayment ? String(linkposPayment.txCode ?? '20') : null,
      linkpos_bank_id: linkposPayment ? String(linkposPayment.bankId ?? '') : null,
      linkpos_response_code: linkposPayment ? String(linkposPayment.responseCode ?? '') : null,
      linkpos_approval_code: linkposPayment ? String(linkposPayment.approvalCode ?? '') : null,
      linkpos_trace_no: linkposPayment ? String(linkposPayment.traceNo ?? '') : null,
      linkpos_ref_no: linkposPayment ? String(linkposPayment.refNo ?? '') : null,
      linkpos_terminal_id: linkposPayment ? String(linkposPayment.terminalId ?? '') : null,
      linkpos_merchant_id: linkposPayment ? String(linkposPayment.merchantId ?? '') : null,
      linkpos_reference1: linkposPayment ? String(linkposPayment.reference1 ?? '') : null,
      linkpos_requested_amount: linkposPayment ? Number(linkposPayment.requestedAmount ?? 0) : null,
      linkpos_approved_amount: linkposPayment ? Number(linkposPayment.approvedAmount ?? 0) : null,
      linkpos_requested_at: linkposPayment ? String(linkposPayment.requestedAt ?? '') : null,
      linkpos_responded_at: linkposPayment ? String(linkposPayment.respondedAt ?? '') : null,
      idempotency_key_hash: idempotencyKeyHash,
      ...(paidAtStamp ? { paid_at: paidAtStamp } : {}),
    },
      { tenantId: auth?.tenantId }
    )
    let inserted: { id?: number }[] = []
    try {
      inserted = (await supabaseInsertWithPgrst204Fallback(
        'pos_orders',
        row,
        'savePosOrder'
      )) as { id?: number }[]
    } catch (insertErr) {
      if (isMissingServiceColumnsError(insertErr)) {
        const legacyRow = { ...row } as Record<string, unknown>
        delete legacyRow.service_amt
        delete legacyRow.service_reason
        legacyRow.discount_amt = discountAmtForPricing
        if (serviceAmt > 0) {
          const baseReason = String(legacyRow.discount_reason ?? '').trim()
          const svcReason = serviceReason || `service:${serviceAmt}`
          legacyRow.discount_reason = [baseReason, svcReason].filter(Boolean).join(' · ')
        }
        inserted = (await supabaseInsertWithPgrst204Fallback(
          'pos_orders',
          legacyRow,
          'savePosOrder'
        )) as { id?: number }[]
      } else if (idempotencyKeyHash && isIdempotencyUniqueViolation(insertErr)) {
        const dbHit = await readIdempotencyHitFromDb(idempotencyKeyHash)
        if (dbHit) {
          return NextResponse.json(
            { success: true, orderId: dbHit.id, orderNo: dbHit.orderNo, duplicate: true },
            { headers }
          )
        }
        throw insertErr
      } else {
        throw insertErr
      }
    }
    const created = inserted[0]
    if (idempotencyKey && Number(created?.id) > 0) {
      writeIdempotencyHit(idempotencyKey, Number(created.id), orderNo)
    }

    if (linkposPayment && Number(created?.id) > 0) {
      try {
        await supabaseInsert('pos_payment_attempts', {
          order_id: Number(created.id),
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
        // local_tx_id unique 충돌(중복 재전송) 시 무시
        console.error('savePosOrder linkpos attempt insert:', e)
      }
    }
    if (kbankPartnerTransactionId && Number(created?.id) > 0) {
      try {
        await supabaseUpdateByFilter(
          'pos_payment_attempts',
          `local_tx_id=eq.${encodeURIComponent(kbankPartnerTransactionId)}`,
          {
            order_id: Number(created.id),
          }
        )
      } catch (e) {
        console.error('savePosOrder kbank attempt link:', e)
      }
    }

    const paymentSum = paymentSumForStatus
    const paymentComplete = total > 0 && paymentSum >= total - 0.02
    let pointEarned = pointEarnedReq
    let stampResult: import('@/lib/member-stamp-card').MemberStampRecordResult | null = null
    if (memberId > 0 && paymentComplete && created?.id) {
      const loyalty = await applyLoyaltyOnOrder({
        memberId,
        orderId: Number(created.id),
        storeCode,
        totalAmount: total,
        pointUsed,
        pointEarned: pointEarnedReq,
        orderNo,
        couponCode: appliedCoupons.length === 1 ? appliedCoupons[0]?.code : couponCode,
        orderType,
        createdBy,
      })
      pointEarned = loyalty.pointEarned
      stampResult = loyalty.stamp ?? null
      await supabaseUpdateByFilter('pos_orders', `id=eq.${Number(created.id)}`, {
        point_earned: pointEarned,
      })
    }

    if (Number(created?.id) > 0 && appliedCoupons.length > 0) {
      try {
        await persistPosOrderCouponRedemptions({
          orderId: Number(created.id),
          storeCode,
          appliedCoupons,
          memberId: memberId || undefined,
        })
      } catch (redeemErr) {
        console.error('savePosOrder coupon redemptions:', redeemErr)
      }
    }

    try {
      await upsertTaxRecipientFromOrderMemo(storeCode, memo, 'pos_order_memo')
    } catch (taxErr) {
      console.error('savePosOrder tax recipient upsert:', taxErr)
    }

    if (isPosCompletionStatus(orderStatus) && Number(created?.id) > 0) {
      const createdAtIso = String((created as { created_at?: string } | undefined)?.created_at || new Date().toISOString())
      await runCompletionSideEffects({
        orderId: Number(created.id),
        orderNo,
        storeCode,
        total,
        subtotal,
        vat,
        serviceAmount: serviceAmt,
        createdAtIso,
        paymentCash,
        paymentCard,
        paymentQr,
        paymentOther,
        paymentDeliveryApp,
        createdBy,
      })
    }

    if (Number(created?.id) > 0) {
      await writePosOrderAuditTrail({
        orderId: Number(created?.id),
        orderNo,
        storeCode,
        actionType: 'create_order',
        idempotencyKey: idempotencyKey || null,
        source: 'api',
        actor: {
          name: String(auth?.name || createdBy || '').trim() || null,
          role: String(auth?.role || '').trim() || null,
          store: String(auth?.store || '').trim() || null,
          employeeCode: String(auth?.employeeCode || '').trim() || null,
          employeeId:
            auth?.employeeId != null && Number.isFinite(Number(auth.employeeId))
              ? Math.floor(Number(auth.employeeId))
              : null,
        },
        before: null,
        after: {
          status: orderStatus,
          total,
          table_name: tableName || null,
          memo: memo || null,
          payment_cash: paymentCash,
          payment_card: paymentCard,
          payment_qr: paymentQr,
          payment_other: paymentOther,
          payment_delivery_app: paymentDeliveryAppFinal,
        },
        reason: 'new_order_created',
      })
    }

    if (Number(created?.id) > 0 && isPosCompletionStatus(orderStatus)) {
      await enqueueKitchenPrintJob({
        storeCode,
        orderId: Number(created.id),
        orderNo,
        source: 'savePosOrder',
        dedupeKey: buildKitchenJobCreateDedupeKey(Number(created.id)),
        payload: {
          action: 'create_order',
          status: orderStatus,
        },
      })
    }

    const totalElapsedMs = Date.now() - startedAtMs
    headers.set('X-Pos-Save-Elapsed-Ms', String(totalElapsedMs))
    headers.set('X-Pos-Save-Allocate-OrderNo-Ms', String(allocateOrderNoMs))
    return NextResponse.json(
      {
        success: true,
        orderId: created?.id,
        orderNo,
        pointEarned,
        stamp: stampResult,
        perf: {
          elapsedMs: totalElapsedMs,
          allocateOrderNoMs,
        },
      },
      { headers }
    )
  } catch (e) {
    console.error('savePosOrder:', e)
    const msg = e instanceof Error ? e.message : String(e)
    const totalElapsedMs = Date.now() - startedAtMs
    headers.set('X-Pos-Save-Elapsed-Ms', String(totalElapsedMs))
    headers.set('X-Pos-Save-Allocate-OrderNo-Ms', String(allocateOrderNoMs))
    return NextResponse.json(
      {
        success: false,
        message: msg.slice(0, 500),
        retryAfterQueue: true,
        perf: {
          elapsedMs: totalElapsedMs,
          allocateOrderNoMs,
        },
      },
      { headers }
    )
  }
}
