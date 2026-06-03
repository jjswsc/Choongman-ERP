import { describe, expect, it } from 'vitest'
import {
  couponIssueStatusLabel,
  filterMemberCouponIssues,
  formatCouponBenefit,
  parseCrmCouponAdminTab,
  redemptionModeLabel,
} from '@/lib/crm-coupon-admin'

describe('crm-coupon-admin', () => {
  it('parses admin tab', () => {
    expect(parseCrmCouponAdminTab('issue')).toBe('issue')
    expect(parseCrmCouponAdminTab('unknown')).toBe('definitions')
  })

  it('formats benefit labels', () => {
    expect(formatCouponBenefit({ discountType: 'percent', discountValue: 10 })).toBe('10%')
    expect(redemptionModeLabel('member_issue')).toBe('회원 발급')
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
