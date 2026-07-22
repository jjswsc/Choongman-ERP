import type { PosCoupon } from '@/lib/api-client'

export type CrmCouponAdminTab = 'definitions' | 'issue' | 'history' | 'campaigns' | 'stamp' | 'promo'

export type MemberCouponIssueRow = {
  id: number
  memberId: number
  memberNo?: string
  memberName?: string
  couponCode: string
  couponName: string
  discountType: string
  discountValue: number
  minOrderAmt: number
  validTo: string
  issuedAt: string
  expiresAt: string
  usedAt: string
  orderId: number | null
  status: string
  campaignId: number | null
  campaignName: string
}

export function parseCrmCouponAdminTab(raw: string | null | undefined): CrmCouponAdminTab {
  const s = String(raw || '').trim().toLowerCase()
  if (
    s === 'issue' ||
    s === 'history' ||
    s === 'definitions' ||
    s === 'campaigns' ||
    s === 'stamp' ||
    s === 'promo'
  ) {
    return s
  }
  return 'definitions'
}

type CouponLabelT = (key: string) => string

const COUPON_ISSUE_STATUS_KEYS: Record<string, string> = {
  issued: 'crmCouponIssueStatusIssued',
  used: 'crmCouponIssueStatusUsed',
  expired: 'crmCouponIssueStatusExpired',
  cancelled: 'crmCouponIssueStatusCancelled',
  restored: 'crmCouponIssueStatusRestored',
}

const COUPON_ISSUE_STATUS_FALLBACKS: Record<string, string> = {
  issued: '사용 가능',
  used: '사용 완료',
  expired: '만료',
  cancelled: '취소',
  restored: '복원',
}

export function formatCouponBenefit(
  coupon: {
    discountType?: string
    discountValue?: number
  },
  t?: CouponLabelT
): string {
  const type = String(coupon.discountType || 'fixed').trim()
  const val = Number(coupon.discountValue || 0)
  if (type === 'percent') return `${val}%`
  if (type === 'bogo') return '1+1'
  if (type === 'set_fixed') {
    return (t?.('crmCouponBenefitSet') || '세트 {val}฿').replace('{val}', String(val))
  }
  if (type === 'item_fixed') {
    return (t?.('crmCouponBenefitItem') || '품목 {val}฿').replace('{val}', String(val))
  }
  return `${val}฿`
}

export function redemptionModeLabel(mode: string | undefined | null, t?: CouponLabelT): string {
  const s = String(mode || 'reusable_code').trim()
  if (s === 'member_issue') return t?.('posCouponModeMember') || '회원 발급'
  if (s === 'single_use_serial') return t?.('posCouponModeSerial') || '1회용 시리얼'
  return t?.('posCouponModeReusable') || '재사용 코드'
}

export function couponIssueStatusLabel(status: string, t?: CouponLabelT): string {
  const s = String(status || '').trim().toLowerCase()
  const key = COUPON_ISSUE_STATUS_KEYS[s]
  if (key) return t?.(key) || COUPON_ISSUE_STATUS_FALLBACKS[s] || status
  return status || '-'
}

export function filterMemberCouponIssues(
  rows: MemberCouponIssueRow[],
  params: { q?: string; status?: string; couponCode?: string }
): MemberCouponIssueRow[] {
  const q = String(params.q || '').trim().toLowerCase()
  const status = String(params.status || '').trim().toLowerCase()
  const couponCode = String(params.couponCode || '').trim().toUpperCase()
  return rows.filter((row) => {
    if (status && status !== 'all' && String(row.status || '').toLowerCase() !== status) return false
    if (couponCode && String(row.couponCode || '').toUpperCase() !== couponCode) return false
    if (!q) return true
    const hay = [
      row.memberNo,
      row.memberName,
      row.couponCode,
      row.couponName,
      row.campaignName,
      String(row.memberId || ''),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function sortCouponsForAdmin(coupons: PosCoupon[]): PosCoupon[] {
  return [...coupons].sort((a, b) => {
    const ac = String(a.code || '').localeCompare(String(b.code || ''))
    if (ac !== 0) return ac
    return Number(b.id || 0) - Number(a.id || 0)
  })
}

export function couponsForMemberIssue(coupons: PosCoupon[]): PosCoupon[] {
  return sortCouponsForAdmin(coupons).filter(
    (c) => c.isActive !== false && String(c.redemptionMode || 'reusable_code') === 'member_issue'
  )
}
