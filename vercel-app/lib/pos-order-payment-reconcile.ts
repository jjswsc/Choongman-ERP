import {
  parsePaymentOtherBreakdown,
  paymentOtherBreakdownForDb,
  sumPaymentOtherBreakdown,
  type PosPaymentOtherBreakdown,
} from '@/lib/pos-payment-other-breakdown'
import { posOrderPaymentSumFromAmounts } from '@/lib/pos-order-paid-at'

const EPS = 0.02

function round2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

export type PosOrderPaymentAmounts = {
  paymentCash: number
  paymentCard: number
  paymentQr: number
  paymentOther: number
  paymentDeliveryApp: number
}

/** 추가주문(items만) PATCH 시 기존 결제를 0으로 덮어쓰지 않음 */
export function shouldPreserveExistingPosOrderPayment(params: {
  body: Record<string, unknown>
  currentPaymentSum: number
  incomingPaymentSum: number
}): boolean {
  if (params.body?.clearPaymentTender === true || params.body?.clear_payment_tender === true) {
    return false
  }
  if (params.currentPaymentSum <= EPS) return false
  if (params.incomingPaymentSum > EPS) return false
  const closeRaw = String(params.body?.closeStatus ?? params.body?.close_status ?? '').trim().toLowerCase()
  if (closeRaw === 'paid' || closeRaw === 'completed') return false
  if (params.body?.linkposPayment) return false
  return true
}

export function readPreservedPosOrderPaymentAmounts(current: {
  payment_cash?: number
  payment_card?: number
  payment_qr?: number
  payment_other?: number
  payment_delivery_app?: number
}): PosOrderPaymentAmounts {
  return {
    paymentCash: Math.max(0, Number(current.payment_cash ?? 0)),
    paymentCard: Math.max(0, Number(current.payment_card ?? 0)),
    paymentQr: Math.max(0, Number(current.payment_qr ?? 0)),
    paymentOther: Math.max(0, Number(current.payment_other ?? 0)),
    paymentDeliveryApp: Math.max(0, Number(current.payment_delivery_app ?? 0)),
  }
}

function paymentSumOf(payment: PosOrderPaymentAmounts): number {
  return posOrderPaymentSumFromAmounts({
    paymentCash: payment.paymentCash,
    paymentCard: payment.paymentCard,
    paymentQr: payment.paymentQr,
    paymentOther: payment.paymentOther,
    paymentDeliveryApp: payment.paymentDeliveryApp,
  })
}

function withServiceCompBreakdown(
  breakdown: PosPaymentOtherBreakdown | null,
  serviceCompAmt: number
): Record<string, unknown> | null {
  const next: PosPaymentOtherBreakdown = { ...(breakdown ?? {}) }
  const prev = Math.max(0, Number(next.serviceComp ?? 0) || 0)
  next.serviceComp = round2(prev + serviceCompAmt)
  return paymentOtherBreakdownForDb(next)
}

/**
 * 결제 저장 시 total vs payment_* 불일치 자동 보정.
 * - 서비스(컴): gap ≈ serviceAmt → payment_other += service_comp
 * - 배달앱 단독(결제 0): payment_delivery_app = total
 * - 배달앱 단독(부분 기록): payment_delivery_app = total
 */
export function reconcilePosOrderPaymentTenderGap(params: {
  total: number
  serviceAmt?: number
  orderType?: string
  deliveryAppCode?: string | null
  payment: PosOrderPaymentAmounts
  paymentOtherBreakdown?: unknown
}): {
  payment: PosOrderPaymentAmounts
  paymentOtherBreakdown?: Record<string, unknown> | null
  reconciledGap: number
} {
  const total = Math.max(0, Number(params.total) || 0)
  if (total <= EPS) {
    return { payment: params.payment, reconciledGap: 0 }
  }

  let payment = { ...params.payment }
  const breakdown = parsePaymentOtherBreakdown(params.paymentOtherBreakdown)
  const paymentSum = paymentSumOf(payment)
  const gap = round2(total - paymentSum)
  if (Math.abs(gap) <= EPS) {
    return { payment, reconciledGap: 0 }
  }

  const serviceAmt = Math.max(0, Number(params.serviceAmt ?? 0) || 0)
  const orderType = String(params.orderType ?? '').trim().toLowerCase()
  const deliveryCode = String(params.deliveryAppCode ?? '').trim().toLowerCase()

  if (paymentSum <= EPS && orderType === 'delivery' && deliveryCode) {
    payment = { ...payment, paymentDeliveryApp: round2(total) }
    return { payment, paymentOtherBreakdown: null, reconciledGap: round2(total) }
  }

  if (paymentSum > EPS && serviceAmt > EPS && Math.abs(gap - serviceAmt) <= EPS) {
    payment = {
      ...payment,
      paymentOther: round2(payment.paymentOther + gap),
    }
    return {
      payment,
      paymentOtherBreakdown: withServiceCompBreakdown(breakdown, gap),
      reconciledGap: gap,
    }
  }

  const deliveryOnly =
    payment.paymentDeliveryApp > EPS &&
    payment.paymentCash <= EPS &&
    payment.paymentCard <= EPS &&
    payment.paymentQr <= EPS &&
    payment.paymentOther <= EPS

  if (paymentSum > EPS && gap > EPS && orderType === 'delivery' && deliveryCode && deliveryOnly) {
    payment = { ...payment, paymentDeliveryApp: round2(total) }
    return { payment, reconciledGap: gap }
  }

  return { payment, reconciledGap: 0 }
}

/** reconcile 후 payment_other_breakdown 합계가 payment_other 와 맞는지 */
export function paymentOtherBreakdownAfterReconcile(params: {
  paymentOther: number
  paymentOtherBreakdown?: unknown
  reconciledGap: number
  serviceAmt?: number
}): Record<string, unknown> | null | undefined {
  if (params.reconciledGap <= EPS) return undefined
  const serviceAmt = Math.max(0, Number(params.serviceAmt ?? 0) || 0)
  if (Math.abs(params.reconciledGap - serviceAmt) <= EPS) {
    return withServiceCompBreakdown(parsePaymentOtherBreakdown(params.paymentOtherBreakdown), params.reconciledGap)
  }
  const other = Math.max(0, Number(params.paymentOther) || 0)
  if (other <= EPS) return null
  const parsed = parsePaymentOtherBreakdown(params.paymentOtherBreakdown)
  if (!parsed) return null
  if (Math.abs(sumPaymentOtherBreakdown(parsed) - other) <= EPS) {
    return paymentOtherBreakdownForDb(parsed)
  }
  return null
}
