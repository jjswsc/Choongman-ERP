import type { MemberPickupOrderItem } from '@/lib/member-portal-order-server'
import { resolvePosOrderCouponsForSave } from '@/lib/pos-coupon-server'
import type { PosAppliedCouponLine } from '@/lib/pos-coupon-domain'

export function memberPortalCartLinesForCoupons(
  items: MemberPickupOrderItem[]
): Array<{ menuId?: string; categoryCode?: string; quantity: number; lineSubtotal: number }> {
  return items
    .filter((it) => it.qty > 0)
    .map((it) => {
      const qty = Math.max(1, Math.trunc(Number(it.qty || 1)))
      const price = Math.max(0, Number(it.price || 0))
      return {
        menuId: String(it.menuId || '').trim() || undefined,
        quantity: qty,
        lineSubtotal: Math.max(0, price * qty),
      }
    })
}

export async function resolveMemberPortalCheckoutCoupons(params: {
  memberId: number
  subtotal: number
  items: MemberPickupOrderItem[]
  couponCode?: string
}): Promise<{
  appliedCoupons: PosAppliedCouponLine[]
  couponCode: string
  couponDiscountAmt: number
  appliedCouponsJson: PosAppliedCouponLine[] | null
}> {
  const code = String(params.couponCode || '')
    .trim()
    .toUpperCase()
  if (!code) {
    return {
      appliedCoupons: [],
      couponCode: '',
      couponDiscountAmt: 0,
      appliedCouponsJson: null,
    }
  }

  const cartLines = memberPortalCartLinesForCoupons(params.items)
  const resolved = await resolvePosOrderCouponsForSave({
    body: {
      couponCode: code,
      appliedCoupons: [{ code, name: code, discountAmt: 0, quantity: 1 }],
    },
    subtotal: params.subtotal,
    manualDiscountAmt: 0,
    cartLines,
    memberId: params.memberId,
  })

  if (!resolved.appliedCoupons.length || resolved.couponDiscountAmt <= 0) {
    throw new Error('coupon_invalid')
  }

  return {
    appliedCoupons: resolved.appliedCoupons,
    couponCode: resolved.couponCode,
    couponDiscountAmt: resolved.couponDiscountAmt,
    appliedCouponsJson: resolved.appliedCouponsJson as PosAppliedCouponLine[] | null,
  }
}
