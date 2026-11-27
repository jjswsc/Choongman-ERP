export type PosDeliveryAppSettlementOrderRow = {
  payment_delivery_app?: number | null
  payment_cash?: number | null
  payment_card?: number | null
  payment_qr?: number | null
  payment_other?: number | null
  total?: number | null
  subtotal?: number | null
  discount_amt?: number | null
  coupon_discount_amt?: number | null
  delivery_app_code?: string | null
  order_type?: string | null
}

function roundBaht(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

/**
 * 배달앱 결산 AUTO GROSS — Shopee 등 POS 수동 할인 후에도 payment_delivery_app이
 * 메뉴가(subtotal)로 남는 경우 total·discount_amt로 순매출을 복원한다.
 *
 * 웹훅 유입(Shopee 등)은 이미 payment_delivery_app = total_amount(할인 반영 순액)이고
 * discount_amt는 플랫폼 프로모 역산값이다. 배송·포장비가 있으면 subtotal ≤ total 이라
 * 예전 분기가 discount를 한 번 더 빼 POS 마감이 앱보다 작아졌다.
 * → discount 역산은 payment가 여전히 메뉴 총액(subtotal)과 같을 때만 허용한다.
 */
export function resolvePosDeliveryAppSettlementGross(row: PosDeliveryAppSettlementOrderRow): number {
  const del = Math.max(0, Number(row.payment_delivery_app) || 0)
  const total = Math.max(0, Number(row.total) || 0)
  const subtotal = Math.max(0, Number(row.subtotal) || 0)
  const discount = Math.max(0, Number(row.discount_amt) || 0)
  const coupon = Math.max(0, Number(row.coupon_discount_amt) || 0)

  if (del > 0.005) {
    if (total > 0.005) {
      if (total < del - 0.02) return roundBaht(total)
      if (subtotal > total + 0.02) return roundBaht(total)
    }
    /** payment가 아직 메뉴가(할인 전)로 남은 수동 할인 케이스만 역산 */
    const paymentStillLooksLikeMenuGross = subtotal > 0.005 && Math.abs(del - subtotal) <= 0.02
    const inferred = del - discount - coupon
    if (
      paymentStillLooksLikeMenuGross &&
      (discount > 0.005 || coupon > 0.005) &&
      inferred > 0.005 &&
      inferred < del - 0.02
    ) {
      return roundBaht(inferred)
    }
    return roundBaht(del)
  }

  const code = String(row.delivery_app_code ?? '').trim().toLowerCase()
  const orderType = String(row.order_type ?? '').trim().toLowerCase()
  if (orderType !== 'delivery' || !code) return 0
  const platformPay = Math.max(0, Number(row.payment_other) || 0, Number(row.payment_cash) || 0)
  if (platformPay <= 0.005) return 0
  if (total > 0.005) return roundBaht(total)
  return roundBaht(platformPay)
}

/** 저장 시 배달앱 단독 결제면 payment_delivery_app을 순매출(total)과 일치시킨다. */
export function syncPosPaymentDeliveryAppToNetTotal(params: {
  paymentDeliveryApp: number
  paymentCash: number
  paymentCard: number
  paymentQr: number
  paymentOther: number
  total: number
}): number {
  const del = Math.max(0, params.paymentDeliveryApp)
  if (del <= 0.005) return 0
  const total = Math.max(0, params.total)
  if (total <= 0.005) return roundBaht(del)
  const otherPay =
    Math.max(0, params.paymentCash) +
    Math.max(0, params.paymentCard) +
    Math.max(0, params.paymentQr) +
    Math.max(0, params.paymentOther)
  if (otherPay <= 0.02) return roundBaht(total)
  if (del > total + 0.02) return roundBaht(total)
  return roundBaht(del)
}
