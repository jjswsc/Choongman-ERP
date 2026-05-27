import { normalizePosPaymentTender } from '@/lib/pos-payment-tender-normalize'

/** 손님 영수증 — 현금 받은 금액·거스름돈 표시 */

export type CashTenderReceiptLines = {
  charge: number
  paidCash: number
  change: number
}

const EPS = 0.005

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 받은 현금이 기록된 경우에만 Charge / Paid / Change 행 생성 */
export function resolveCashTenderReceiptLines(params: {
  paymentCash?: number
  paymentCashTendered?: number
}): CashTenderReceiptLines | null {
  const cash = Math.max(0, Number(params.paymentCash ?? 0) || 0)
  let tendered = Math.max(0, Number(params.paymentCashTendered ?? 0) || 0)
  /** 받은 금액 미저장·정확히 맞춘 현금만 있을 때: Paid=Charge, Change=0 */
  if (tendered <= EPS && cash > EPS) tendered = cash
  if (cash <= EPS || tendered <= EPS) return null
  if (tendered + EPS < cash) return null
  return {
    charge: round2(cash),
    paidCash: round2(tendered),
    change: round2(Math.max(0, tendered - cash)),
  }
}

export type ReceiptPaymentSnapshotForPrint = {
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentQrType?: 'THAI_QR' | 'CREDIT_CARD'
  paymentOther?: number
  paymentOtherBreakdown?: import('@/lib/pos-payment-other-breakdown').PosPaymentOtherBreakdown | null
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
  paymentCashTendered?: number
}

/** 결제 스냅샷 → `ReceiptModalData` 결제 필드 */
export function receiptPaymentFieldsFromSnapshot(
  payment?: ReceiptPaymentSnapshotForPrint | null
): Record<string, unknown> {
  if (!payment) return {}
  const tendered = Math.max(0, Number(payment.paymentCashTendered ?? 0) || 0)
  return {
    paymentCash: payment.paymentCash,
    paymentCard: payment.paymentCard,
    paymentQr: payment.paymentQr,
    paymentOther: payment.paymentOther,
    ...(payment.paymentOtherBreakdown ? { paymentOtherBreakdown: payment.paymentOtherBreakdown } : {}),
    paymentDeliveryApp: payment.paymentDeliveryApp ?? 0,
    deliveryPaymentChannel: payment.deliveryPaymentChannel ?? null,
    ...(tendered > EPS ? { paymentCashTendered: tendered } : {}),
  }
}

/** 결제 스냅샷 → `savePosOrder` / `updatePosOrder` body */
export function posOrderPaymentFieldsFromSnapshot(payment?: ReceiptPaymentSnapshotForPrint | null) {
  if (!payment) {
    return {
      paymentCash: 0,
      paymentCard: 0,
      paymentQr: 0,
      paymentOther: 0,
      paymentDeliveryApp: 0,
      deliveryPaymentChannel: null as string | null,
      paymentCashTendered: 0,
    }
  }
  const tendered = Math.max(0, Number(payment.paymentCashTendered ?? 0) || 0)
  const normalizedTender = normalizePosPaymentTender({
    paymentCard: payment.paymentCard,
    paymentQr: payment.paymentQr,
    paymentQrType: payment.paymentQrType,
  })
  return {
    paymentCash: Math.max(0, Number(payment.paymentCash ?? 0) || 0),
    paymentCard: normalizedTender.paymentCard,
    paymentQr: normalizedTender.paymentQr,
    ...(payment.paymentQrType ? { paymentQrType: payment.paymentQrType } : {}),
    paymentOther: Math.max(0, Number(payment.paymentOther ?? 0) || 0),
    ...(payment.paymentOtherBreakdown ? { paymentOtherBreakdown: payment.paymentOtherBreakdown } : {}),
    paymentDeliveryApp: Math.max(0, Number(payment.paymentDeliveryApp ?? 0) || 0),
    deliveryPaymentChannel: payment.deliveryPaymentChannel ?? null,
    paymentCashTendered: tendered,
  }
}
