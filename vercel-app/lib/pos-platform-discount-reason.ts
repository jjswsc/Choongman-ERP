import { resolveOrderDeliveryAppCode } from '@/lib/pos-delivery-order-meta'

function nonCouponDiscountAmt(discountAmt: number, couponTotal: number): number {
  const discount = Math.max(0, discountAmt)
  const coupon = Math.max(0, couponTotal)
  if (coupon <= 0.0001) return discount
  if (discount + 0.0001 >= coupon) return Math.max(0, discount - coupon)
  return discount
}

/** API·배달앱 주문 저장 시 discount_reason — 할인 분석「배달·플랫폼」분류용 */
export const DELIVERY_APP_PLATFORM_DISCOUNT_REASON = {
  grab: 'Grab platform promo',
  shopee: 'Shopee platform promo',
  lineman: 'Line Man platform promo',
  foodpanda: 'Foodpanda platform promo',
  robinhood: 'Robinhood platform promo',
  generic: 'Delivery platform promo',
} as const

export function normalizeDeliveryAppCode(code: string): string {
  return String(code ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
}

export function isKnownDeliveryAppCode(code: string): boolean {
  const c = normalizeDeliveryAppCode(code)
  if (!c) return false
  return (
    c.includes('grab') ||
    c.includes('shopee') ||
    c.includes('lineman') ||
    (c.includes('line') && c.includes('man')) ||
    c.includes('foodpanda') ||
    c.includes('robinhood')
  )
}

export function resolvePlatformDiscountReasonForSave(appCode: string, discountAmt: number): string {
  if (Math.max(0, Number(discountAmt) || 0) <= 0.0001) return ''
  const c = normalizeDeliveryAppCode(appCode)
  if (c.includes('grab')) return DELIVERY_APP_PLATFORM_DISCOUNT_REASON.grab
  if (c.includes('shopee')) return DELIVERY_APP_PLATFORM_DISCOUNT_REASON.shopee
  if (c.includes('lineman') || (c.includes('line') && c.includes('man'))) {
    return DELIVERY_APP_PLATFORM_DISCOUNT_REASON.lineman
  }
  if (c.includes('foodpanda')) return DELIVERY_APP_PLATFORM_DISCOUNT_REASON.foodpanda
  if (c.includes('robinhood')) return DELIVERY_APP_PLATFORM_DISCOUNT_REASON.robinhood
  return DELIVERY_APP_PLATFORM_DISCOUNT_REASON.generic
}

/** 결제 할인 분류 — discount_reason 키워드 */
export function isPlatformDiscountReasonText(reason: string): boolean {
  const r = reason.toLowerCase()
  if (!r) return false
  const needles = [
    'grab',
    'shopee',
    'shopeefood',
    'lineman',
    'line man',
    'foodpanda',
    'robinhood',
    'delivery platform',
    'platform promo',
    'delivery',
    '배달',
    'แอป',
  ]
  return needles.some((n) => r.includes(n))
}

export type DeliveryPlatformDiscountOrderRow = {
  discount_reason?: string
  order_type?: string
  delivery_app_code?: string | null
  items_json?: string | null
  discount_amt?: number
  coupon_discount_amt?: number
}

/** 배달앱 API·플랫폼 정산 주문 — discount_amt(비쿠폰) 있고 delivery_app_code 식별 가능 */
export function isDeliveryPlatformDiscountOrder(order: DeliveryPlatformDiscountOrderRow): boolean {
  if (String(order.order_type ?? '').trim().toLowerCase() !== 'delivery') return false
  const app = resolveOrderDeliveryAppCode(order)
  if (!isKnownDeliveryAppCode(app)) return false
  const discountAmt = Math.max(0, Number(order.discount_amt) || 0)
  const couponAmtField = Math.max(0, Number(order.coupon_discount_amt) || 0)
  const nonCoupon = nonCouponDiscountAmt(discountAmt, couponAmtField)
  return nonCoupon > 0.0001
}

export function resolvePlatformDiscountReasonForAnalytics(
  order: DeliveryPlatformDiscountOrderRow,
  nonCouponAmt: number
): string {
  const explicit = String(order.discount_reason ?? '').trim()
  if (explicit) return explicit
  const app = resolveOrderDeliveryAppCode(order)
  return resolvePlatformDiscountReasonForSave(app, nonCouponAmt)
}

/** Grab memo 등 — delivery_app_code 없을 때 보정용 앱 코드 */
export function resolveDeliveryAppCodeForPlatformBackfill(row: {
  delivery_app_code?: string | null
  items_json?: string | null
  memo?: string | null
}): string {
  const fromOrder = resolveOrderDeliveryAppCode(row)
  if (isKnownDeliveryAppCode(fromOrder)) return fromOrder
  const memo = String(row.memo ?? '')
  if (/grab_order:/i.test(memo)) return 'grab'
  if (/shopeefood/i.test(memo)) return 'shopee'
  return fromOrder
}

/** DB backfill — 반환값이 있으면 discount_reason 갱신 대상 */
export function resolvePlatformDiscountReasonBackfillPatch(
  order: DeliveryPlatformDiscountOrderRow & { memo?: string | null }
): string | null {
  const app = resolveDeliveryAppCodeForPlatformBackfill(order)
  if (!isKnownDeliveryAppCode(app)) return null
  if (String(order.order_type ?? '').trim().toLowerCase() !== 'delivery') return null

  const discountAmt = Math.max(0, Number(order.discount_amt) || 0)
  const couponAmtField = Math.max(0, Number(order.coupon_discount_amt) || 0)
  const nonCoupon = nonCouponDiscountAmt(discountAmt, couponAmtField)
  if (nonCoupon <= 0.0001) return null

  const expected = resolvePlatformDiscountReasonForSave(app, nonCoupon)
  if (!expected) return null

  const current = String(order.discount_reason ?? '').trim()
  if (current === expected) return null
  return expected
}
