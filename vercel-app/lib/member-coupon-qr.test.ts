import { describe, expect, it } from 'vitest'
import {
  buildMemberCouponQrPayload,
  isMemberCouponQrPayload,
  parseMemberCouponQrPayload,
} from '@/lib/member-coupon-qr'

describe('member-coupon-qr', () => {
  it('builds and parses coupon qr payload', () => {
    const raw = buildMemberCouponQrPayload({
      memberNo: 'CM1001',
      couponCode: 'welcome10',
      issueId: 42,
    })
    expect(raw).toBe('CM|CPN|CM1001|WELCOME10|42')
    expect(parseMemberCouponQrPayload(raw)).toEqual({
      memberNo: 'CM1001',
      couponCode: 'WELCOME10',
      issueId: 42,
    })
  })

  it('detects prefixed payloads', () => {
    expect(isMemberCouponQrPayload('CM|CPN|A|B')).toBe(true)
    expect(isMemberCouponQrPayload('WELCOME10')).toBe(false)
  })
})
