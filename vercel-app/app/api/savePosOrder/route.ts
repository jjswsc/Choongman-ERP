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
import { resolveBangkokAccountingDate, isPosCompletionStatus } from '@/lib/pos-order-policy'
import { upsertPosVatLedgerDraft } from '@/lib/pos-ledger-drafts'
import {
  coercePaymentOtherBreakdownForSave,
  paymentOtherBreakdownForDb,
} from '@/lib/pos-payment-other-breakdown'

const DELIVERY_PAYMENT_CHANNELS = new Set(['grab', 'lineman', 'shopee', 'dine_in'])
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

async function runCompletionSideEffects(params: {
  orderId: number
  orderNo: string
  storeCode: string
  total: number
  subtotal: number
  vat: number
  createdAtIso: string
  paymentCash: number
  paymentCard: number
  paymentQr: number
  paymentOther: number
  paymentDeliveryApp: number
  createdBy?: string
}): Promise<void> {
  const { orderId, orderNo, storeCode, total, subtotal, vat, createdAtIso, createdBy } = params
  if (!storeCode) return
  const salesDate = resolveBangkokAccountingDate(createdAtIso)
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
    const deliveryFee = Math.max(0, Number(body.deliveryFee ?? 0))
    const packagingFee = Math.max(0, Number(body.packagingFee ?? 0))
    const paymentCash = Math.max(0, Number(body.paymentCash ?? 0))
    const paymentCard = Math.max(0, Number(body.paymentCard ?? 0))
    const paymentQr = Math.max(0, Number(body.paymentQr ?? 0))
    const paymentOther = Math.max(0, Number(body.paymentOther ?? 0))
    const paymentOtherBreakdown = coercePaymentOtherBreakdownForSave(
      paymentOther,
      body.paymentOtherBreakdown ?? body.payment_other_breakdown
    )
    const paymentOtherBreakdownDb = paymentOtherBreakdownForDb(paymentOtherBreakdown)
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
    const linkposPayment =
      body.linkposPayment && typeof body.linkposPayment === 'object'
        ? (body.linkposPayment as Record<string, unknown>)
        : null

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

    const paymentSumForStatus = paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryApp
    const closeStatusRaw = String(body.closeStatus ?? body.close_status ?? '').trim().toLowerCase()
    const closeStatus =
      closeStatusRaw === 'paid' || closeStatusRaw === 'completed' ? closeStatusRaw : null
    let orderStatus = 'pending'
    if (total > 0 && paymentSumForStatus >= total - 0.02) {
      if (closeStatus === 'paid' || closeStatus === 'completed') {
        orderStatus = closeStatus
      }
    }

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
      status: orderStatus,
      payment_cash: paymentCash,
      payment_card: paymentCard,
      payment_qr: paymentQr,
      payment_other: paymentOther,
      ...(paymentOther <= 0.005
        ? { payment_other_breakdown: null }
        : paymentOtherBreakdownDb
          ? { payment_other_breakdown: paymentOtherBreakdownDb }
          : {}),
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
    }
    let inserted: { id?: number }[]
    try {
      inserted = (await supabaseInsertWithPgrst204Fallback(
        'pos_orders',
        row,
        'savePosOrder'
      )) as { id?: number }[]
    } catch (insertErr) {
      if (idempotencyKeyHash && isIdempotencyUniqueViolation(insertErr)) {
        const dbHit = await readIdempotencyHitFromDb(idempotencyKeyHash)
        if (dbHit) {
          return NextResponse.json(
            { success: true, orderId: dbHit.id, orderNo: dbHit.orderNo, duplicate: true },
            { headers }
          )
        }
      }
      throw insertErr
    }
    const created = Array.isArray(inserted) ? inserted[0] : inserted
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

    const paymentSum = paymentSumForStatus
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

    if (isPosCompletionStatus(orderStatus) && Number(created?.id) > 0) {
      const createdAtIso = String((created as { created_at?: string } | undefined)?.created_at || new Date().toISOString())
      await runCompletionSideEffects({
        orderId: Number(created.id),
        orderNo,
        storeCode,
        total,
        subtotal,
        vat,
        createdAtIso,
        paymentCash,
        paymentCard,
        paymentQr,
        paymentOther,
        paymentDeliveryApp,
        createdBy,
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
