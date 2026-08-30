import type { PosOrder } from '@/lib/api-client'
import { isPosOrderPaidLikeStatus, posOrderPaymentSum } from '@/lib/pos-payment-receipt-from-order'

const PAYMENT_EPS = 0.02

type PosOrderPaidAtSource = Pick<
  PosOrder,
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'paidAt'
  | 'linkposRespondedAt'
  | 'paymentCash'
  | 'paymentCard'
  | 'paymentQr'
  | 'paymentOther'
  | 'paymentDeliveryApp'
  | 'paymentCrypto'
>

export function posOrderPaymentSumFromAmounts(row: {
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  paymentDeliveryApp?: number
  paymentCrypto?: number
}): number {
  return (
    Math.max(0, Number(row.paymentCash ?? 0)) +
    Math.max(0, Number(row.paymentCard ?? 0)) +
    Math.max(0, Number(row.paymentQr ?? 0)) +
    Math.max(0, Number(row.paymentOther ?? 0)) +
    Math.max(0, Number(row.paymentDeliveryApp ?? 0)) +
    Math.max(0, Number(row.paymentCrypto ?? 0))
  )
}

export function isPosOrderPaymentCompleteForTotal(total: number, paymentSum: number): boolean {
  return total > 0 && paymentSum >= total - PAYMENT_EPS
}

/** 결제가 처음 완료될 때 paid_at 에 넣을 ISO. 이미 찍혀 있거나 아직 미결제면 null */
export function resolvePosOrderPaidAtStampIso(params: {
  existingPaidAt?: string | null
  total: number
  previousPaymentSum: number
  nextPaymentSum: number
  linkposRespondedAt?: string | null
}): string | null {
  if (parseValidIso(params.existingPaidAt)) return null
  if (!isPosOrderPaymentCompleteForTotal(params.total, params.nextPaymentSum)) return null
  if (isPosOrderPaymentCompleteForTotal(params.total, params.previousPaymentSum)) return null
  const linkposAt = parseValidIso(params.linkposRespondedAt)
  return linkposAt ?? new Date().toISOString()
}

function parseValidIso(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return s
}

/**
 * PostgREST timestamptz 컬럼용.
 * `""` 를 넣으면 Postgres 22007 (`invalid input syntax for type timestamp`) 발생 → null 사용.
 */
export function nullableTimestamptz(raw: unknown): string | null {
  if (raw == null) return null
  return parseValidIso(String(raw))
}

/** 결제·완료 영수증·목록 정렬용 시각 — 접수(created_at)가 아닌 결제 완료에 가까운 시각 */
export function resolvePosOrderPaidAt(order: PosOrderPaidAtSource): string {
  const createdAt = parseValidIso(order.createdAt)
  const storedPaidAt = parseValidIso(order.paidAt)
  const linkposAt = parseValidIso(order.linkposRespondedAt)
  const paymentSum = posOrderPaymentSum(order as PosOrder)
  const hasPayment =
    paymentSum > 0.005 || isPosOrderPaidLikeStatus(String(order.status ?? ''))

  if (storedPaidAt) return storedPaidAt

  if (linkposAt && hasPayment) return linkposAt

  if (hasPayment) {
    const updatedAt = parseValidIso(order.updatedAt)
    if (updatedAt) {
      if (!createdAt) return updatedAt
      const u = new Date(updatedAt).getTime()
      const c = new Date(createdAt).getTime()
      if (u > c) return updatedAt
    }
    return ''
  }

  return createdAt ?? ''
}

export function resolvePosOrderPaidAtDate(order: PosOrderPaidAtSource): Date {
  const raw = resolvePosOrderPaidAt(order)
  if (raw) {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }
  const createdAt = parseValidIso(order.createdAt)
  if (createdAt) {
    const d = new Date(createdAt)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }
  return new Date()
}
