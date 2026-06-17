import type { PortalCouponRow } from '@/components/member-portal/portal-ui'

export type CouponBenefitDisplay = {
  badge: string
  headline: string
  subline?: string
  summary: string
}

export function resolveCouponBenefitDisplay(coupon: PortalCouponRow): CouponBenefitDisplay {
  const discountType = String(coupon.discountType || 'fixed').toLowerCase()
  const discountValue = Number(coupon.discountValue || 0)
  const maxDiscountAmt = Number(coupon.maxDiscountAmt || 0)

  if (discountType === 'bogo') {
    return { badge: 'BOGO', headline: '1+1', summary: '1+1' }
  }
  if (discountType === 'set_fixed') {
    const headline = `฿${Math.round(discountValue)}`
    return { badge: 'SET', headline, subline: 'combo deal', summary: `Set ${headline}` }
  }
  if (discountType === 'item_fixed') {
    const headline = `฿${Math.round(discountValue)}`
    return { badge: 'ITEM', headline, subline: 'per item', summary: `${headline} / item` }
  }
  if (discountType === 'percent') {
    const headline = `${discountValue}%`
    const subline = maxDiscountAmt > 0 ? `max ฿${Math.round(maxDiscountAmt)}` : 'discount'
    const summary =
      maxDiscountAmt > 0 ? `${headline} (max ฿${Math.round(maxDiscountAmt)})` : headline
    return { badge: 'OFF', headline, subline, summary }
  }

  const headline = `฿${Math.round(discountValue)}`
  return { badge: 'SAVE', headline, subline: 'discount', summary: headline }
}

export function formatCouponBenefitText(coupon: PortalCouponRow): string {
  return resolveCouponBenefitDisplay(coupon).summary
}
