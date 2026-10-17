/**
 * 카운터 KBank QR 마감 — 클라이언트·서버 공용 순수 로직 (server-only 금지).
 */
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
