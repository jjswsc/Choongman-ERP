/** QR 테이블 계산서(잔액) 결제 — 은행 입금액 vs 주문 잔액 정합 */

export const QR_TABLE_BILL_PAY_EPS = 0.02

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function asNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * 은행·발행 QR 금액을 payment_qr에 반영할 때 전액 결제(paid) 여부.
 * 발행 후 다른 기기에서 메뉴가 추가되면 입금액 < 잔액이 될 수 있음 → paid 금지.
 */
export function resolveQrBillPaySettlement(input: {
  orderTotal: number
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  paymentDeliveryApp?: number
  /** 이번 확정에 인정할 입금(발행 QR·은행 승인액). 0이면 잔액 전액 채움(잔액 0 확정용). */
  paidAmount: number
}): {
  payAmt: number
  nextPaymentQr: number
  nextPaySum: number
  remainingDue: number
  markPaid: boolean
} {
  const total = Math.max(0, round2(asNum(input.orderTotal)))
  const priorQr = Math.max(0, asNum(input.paymentQr))
  const otherPaid =
    asNum(input.paymentCash) +
    asNum(input.paymentCard) +
    asNum(input.paymentOther) +
    asNum(input.paymentDeliveryApp)
  const priorSum = round2(priorQr + otherPaid)
  const gap = Math.max(0, round2(total - priorSum))
  const requested = Math.max(0, asNum(input.paidAmount))
  const rawPay = requested >= 0.005 ? requested : gap
  /** 잔액보다 많이 기록하지 않음(은행 과대·웹훅 gap 보정 방지) */
  const payAmt = Math.min(rawPay, gap)
  const nextPaymentQr = round2(priorQr + payAmt)
  const nextPaySum = round2(otherPaid + nextPaymentQr)
  const remainingDue = Math.max(0, round2(total - nextPaySum))
  const markPaid = remainingDue <= QR_TABLE_BILL_PAY_EPS
  return { payAmt, nextPaymentQr, nextPaySum, remainingDue, markPaid }
}

/** 결제 QR 화면의 고정 금액보다 주문 잔액이 커졌는지(다른 폰 추가 주문 등) */
export function isQrBillPayAmountStale(params: {
  issuedQrAmount: number
  currentBalanceDue: number
}): boolean {
  const issued = Math.max(0, asNum(params.issuedQrAmount))
  const due = Math.max(0, asNum(params.currentBalanceDue))
  return due > issued + QR_TABLE_BILL_PAY_EPS
}
