import { describe, expect, it } from 'vitest'
import {
  couponIssueStatusLabel,
  couponsForMemberIssue,
  filterMemberCouponIssues,
  formatCouponBenefit,
  parseCrmCouponAdminTab,
  redemptionModeLabel,
} from '@/lib/crm-coupon-admin'

describe('crm-coupon-admin', () => {
  it('parses admin tab', () => {
    expect(parseCrmCouponAdminTab('issue')).toBe('issue')
    expect(parseCrmCouponAdminTab('promo')).toBe('promo')
    expect(parseCrmCouponAdminTab('unknown')).toBe('definitions')
  })

  it('formats benefit labels', () => {
    expect(formatCouponBenefit({ discountType: 'percent', discountValue: 10 })).toBe('10%')
    expect(redemptionModeLabel('member_issue')).toBe('회원 발급')
  })

  it('limits member issue picker to member_issue coupons', () => {
    expect(
      couponsForMemberIssue([
        { id: 1, code: 'A', isActive: true, redemptionMode: 'member_issue' },
        { id: 2, code: 'B', isActive: true, redemptionMode: 'reusable_code' },
        { id: 3, code: 'C', isActive: false, redemptionMode: 'member_issue' },
      ] as Parameters<typeof couponsForMemberIssue>[0])
    ).toEqual([{ id: 1, code: 'A', isActive: true, redemptionMode: 'member_issue' }])
  })

  it('filters issue rows', () => {
    const rows = [
      {
        id: 1,
        memberId: 10,
        memberNo: 'CM1',
        memberName: 'Kim',
        couponCode: 'A10',
        couponName: 'A10',
        discountType: 'fixed',
        discountValue: 100,
        minOrderAmt: 0,
        validTo: '',
        issuedAt: '',
        expiresAt: '',
        usedAt: '',
        orderId: null,
        status: 'issued',
        campaignId: null,
        campaignName: '',
      },
    ]
    expect(filterMemberCouponIssues(rows, { q: 'kim', status: 'issued' })).toHaveLength(1)
    expect(filterMemberCouponIssues(rows, { status: 'used' })).toHaveLength(0)
    expect(couponIssueStatusLabel('issued')).toBe('사용 가능')
  })
})
