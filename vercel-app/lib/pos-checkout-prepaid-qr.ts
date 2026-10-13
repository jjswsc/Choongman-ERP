/**
 * 손님 폰 QR(테이블 계산서)로 일부만 입금된 홀 주문을 카운터에서 마저 받을 때.
 * 카운터 결제 모달은 잔액만 받고, 저장 시 기존 payment_qr을 더해 덮어쓰기 손실을 막는다.
 */

const EPS = 0.02

function round2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

const CLOSED_STATUSES = new Set(['paid', 'completed', 'cancelled', 'canceled', 'refunded'])

/**
 * 카운터 결제에서 차감할 기존 QR 입금액. 부분 입금(0 < QR < 합계)일 때만 인정.
 * 합계 이상이면 웹훅·카운터 대기 등 다른 경로 값일 수 있어 차감하지 않는다(기존 동작 유지).
 */
export function resolveCheckoutPrepaidQrAmt(order: {
  total?: number | null
  paymentQr?: number | null
  status?: string | null
}): number {
  const status = String(order.status ?? '').trim().toLowerCase()
  if (CLOSED_STATUSES.has(status)) return 0
  const total = round2(Number(order.total) || 0)
  const qr = round2(Number(order.paymentQr) || 0)
  if (qr <= EPS || total <= EPS) return 0
  if (qr >= total - EPS) return 0
  return qr
}

/** 이번 카운터 결제 tender에 기존 QR 입금을 더한 저장·영수증용 스냅샷 */
export function mergeCheckoutPrepaidQr<T extends { paymentQr?: number }>(payment: T, prepaidQrAmt: number | undefined): T {
  const prepaid = round2(Number(prepaidQrAmt) || 0)
  if (prepaid <= EPS) return payment
  return { ...payment, paymentQr: round2((Number(payment.paymentQr) || 0) + prepaid) }
}
