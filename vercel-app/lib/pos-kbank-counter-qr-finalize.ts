/**
 * 카운터 POS KBank QR 승인 후 status 마감이 빠진 주문 보정.
 * — 클라이언트는 QR 대기 중 payment_qr를 선저장하고, finalize에서만 completed/paid 로 닫음.
 * — finalize 유실 시 웹훅·승인 폴백이 이 헬퍼로 마감한다.
 * — 선저장 전액에 은행 금액을 더하지 않는다(이중 가산 금지).
 */
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import {
  isPosOrderPaymentCompleteForTotal,
  posOrderPaymentSumFromAmounts,
  resolvePosOrderPaidAtStampIso,
} from '@/lib/pos-order-paid-at'
import { isPosOrderPaidLikeStatus } from '@/lib/pos-payment-receipt-from-order'
import { isDineInOrderTypeForGuestCount } from '@/lib/pos-sales-order-type-filter'

const EPS = 0.02

function round2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

export type CounterKbankQrCloseStatus = 'paid' | 'completed'

/** 홀(후불) → completed, 포장·배달 등 → paid (터미널 targetClose 와 동일) */
export function resolveCounterKbankQrCloseStatus(
  orderType: string | null | undefined
): CounterKbankQrCloseStatus {
  return isDineInOrderTypeForGuestCount(orderType) ? 'completed' : 'paid'
}

export function isPosOrderFullyPaidButOpen(input: {
  status?: string | null
  total?: number | null
  paymentCash?: number | null
  paymentCard?: number | null
  paymentQr?: number | null
  paymentOther?: number | null
  paymentDeliveryApp?: number | null
  paymentCrypto?: number | null
}): boolean {
  if (isPosOrderPaidLikeStatus(String(input.status ?? ''))) return false
  const total = round2(Number(input.total) || 0)
  if (total <= EPS) return false
  const sum = posOrderPaymentSumFromAmounts({
    paymentCash: Number(input.paymentCash) || 0,
    paymentCard: Number(input.paymentCard) || 0,
    paymentQr: Number(input.paymentQr) || 0,
    paymentOther: Number(input.paymentOther) || 0,
    paymentDeliveryApp: Number(input.paymentDeliveryApp) || 0,
    paymentCrypto: Number(input.paymentCrypto) || 0,
  })
  return isPosOrderPaymentCompleteForTotal(total, sum)
}

export type CounterKbankQrFinalizePatchInput = {
  status: string
  orderType?: string | null
  total: number
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  paymentDeliveryApp?: number
  paymentCrypto?: number
  paidAt?: string | null
  /** 은행 승인 금액. 0이면 기존 결제액만으로 마감(선저장 전액 등). */
  bankAmount?: number
}

export type CounterKbankQrFinalizePatchResult =
  | { alreadyPaid: true; patch: null; closeStatus: CounterKbankQrCloseStatus; nextPaymentQr: number }
  | {
      alreadyPaid: false
      patch: Record<string, unknown>
      closeStatus: CounterKbankQrCloseStatus
      nextPaymentQr: number
    }

/**
 * DB UPDATE용 패치. 순수 함수 — 단위 테스트 대상.
 */
export function resolveCounterKbankQrFinalizePatch(
  input: CounterKbankQrFinalizePatchInput
): CounterKbankQrFinalizePatchResult {
  const closeStatus = resolveCounterKbankQrCloseStatus(input.orderType)
  const existingQr = round2(Number(input.paymentQr) || 0)
  if (isPosOrderPaidLikeStatus(String(input.status ?? ''))) {
    return { alreadyPaid: true, patch: null, closeStatus, nextPaymentQr: existingQr }
  }

  const total = round2(Number(input.total) || 0)
  const otherSum = round2(
    (Number(input.paymentCash) || 0) +
      (Number(input.paymentCard) || 0) +
      (Number(input.paymentOther) || 0) +
      (Number(input.paymentDeliveryApp) || 0) +
      (Number(input.paymentCrypto) || 0)
  )
  const priorSum = round2(otherSum + existingQr)
  const bankAmount = round2(Number(input.bankAmount) || 0)

  let nextPaymentQr = existingQr
  if (!isPosOrderPaymentCompleteForTotal(total, priorSum)) {
    const gap = Math.max(0, round2(total - priorSum))
    const payAmt = Math.min(bankAmount > EPS ? bankAmount : gap, gap)
    nextPaymentQr = round2(existingQr + payAmt)
  }

  const nextSum = round2(otherSum + nextPaymentQr)
  const patch: Record<string, unknown> = {
    status: closeStatus,
  }
  if (Math.abs(nextPaymentQr - existingQr) > EPS) {
    patch.payment_qr = nextPaymentQr
  }

  const paidAtStamp = resolvePosOrderPaidAtStampIso({
    existingPaidAt: input.paidAt ?? null,
    total,
    previousPaymentSum: priorSum,
    nextPaymentSum: nextSum,
  })
  if (paidAtStamp) patch.paid_at = paidAtStamp

  return { alreadyPaid: false, patch, closeStatus, nextPaymentQr }
}

export type FinalizeCounterPosKbankQrOrderResult = {
  ok: boolean
  alreadyPaid?: boolean
  status?: string
  tableName?: string
  storeCode?: string
  orderType?: string
  orderId?: number
  message?: string
}

export async function finalizeCounterPosKbankQrOrder(params: {
  orderId: number
  paymentQrAmount?: number
}): Promise<FinalizeCounterPosKbankQrOrderResult> {
  const orderId = Math.floor(Number(params.orderId) || 0)
  if (!(orderId > 0)) return { ok: false, message: 'invalid_order_id' }

  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
    limit: 1,
    select:
      'id,order_no,store_code,status,order_type,table_name,total,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,payment_crypto,paid_at',
  })) as Array<{
    id?: number
    store_code?: string | null
    status?: string | null
    order_type?: string | null
    table_name?: string | null
    total?: number | null
    payment_cash?: number | null
    payment_card?: number | null
    payment_qr?: number | null
    payment_other?: number | null
    payment_delivery_app?: number | null
    payment_crypto?: number | null
    paid_at?: string | null
  }>

  const order = rows?.[0]
  if (!order?.id) return { ok: false, message: 'order_not_found' }

  const resolved = resolveCounterKbankQrFinalizePatch({
    status: String(order.status || ''),
    orderType: order.order_type,
    total: Number(order.total) || 0,
    paymentCash: Number(order.payment_cash) || 0,
    paymentCard: Number(order.payment_card) || 0,
    paymentQr: Number(order.payment_qr) || 0,
    paymentOther: Number(order.payment_other) || 0,
    paymentDeliveryApp: Number(order.payment_delivery_app) || 0,
    paymentCrypto: Number(order.payment_crypto) || 0,
    paidAt: order.paid_at ?? null,
    bankAmount: Number(params.paymentQrAmount) || 0,
  })

  const baseMeta = {
    orderId,
    tableName: String(order.table_name || '').trim(),
    storeCode: String(order.store_code || '').trim(),
    orderType: String(order.order_type || '').trim(),
  }

  if (resolved.alreadyPaid) {
    return {
      ok: true,
      alreadyPaid: true,
      status: String(order.status || ''),
      ...baseMeta,
    }
  }

  await supabaseUpdateByFilter('pos_orders', `id=eq.${orderId}`, resolved.patch)

  return {
    ok: true,
    alreadyPaid: false,
    status: resolved.closeStatus,
    ...baseMeta,
  }
}
