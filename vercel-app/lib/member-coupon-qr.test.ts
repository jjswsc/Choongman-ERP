import { describe, expect, it } from 'vitest'
import {
  buildMemberCouponQrPayload,
  isMemberCouponQrPayload,
  isMemberCouponScanPayload,
  parseLooseMemberCouponScanInput,
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
    expect(isMemberCouponQrPayload('CM~CPN~A~B')).toBe(true)
    expect(isMemberCouponQrPayload('CM-CPN-A-B')).toBe(true)
    expect(isMemberCouponQrPayload('WELCOME10')).toBe(false)
  })

  it('parses scanner tilde/hyphen delimiters', () => {
    expect(parseMemberCouponQrPayload('CM~CPN~M007359~CMHBDCOUPON~504')).toEqual({
      memberNo: 'M007359',
      couponCode: 'CMHBDCOUPON',
      issueId: 504,
    })
    expect(parseMemberCouponQrPayload('CM-CPN-M007359-CMHBDCOUPON-504')).toEqual({
      memberNo: 'M007359',
      couponCode: 'CMHBDCOUPON',
      issueId: 504,
    })
  })

  it('parses truncated scanner payloads without CM|CPN header', () => {
    expect(parseLooseMemberCouponScanInput('CMHBDCOUPON~504')).toEqual({
      memberNo: '',
      couponCode: 'CMHBDCOUPON',
      issueId: 504,
    })
    expect(parseLooseMemberCouponScanInput('HBDCOUPON~504')).toEqual({
      memberNo: '',
      couponCode: 'HBDCOUPON',
      issueId: 504,
    })
    expect(parseLooseMemberCouponScanInput('HBDCOUPON～504')).toEqual({
      memberNo: '',
      couponCode: 'HBDCOUPON',
      issueId: 504,
    })
    expect(parseLooseMemberCouponScanInput('M007359~CMHBDCOUPON~504')).toEqual({
      memberNo: 'M007359',
      couponCode: 'CMHBDCOUPON',
      issueId: 504,
    })
    expect(isMemberCouponScanPayload('HBDCOUPON~504')).toBe(true)
    expect(isMemberCouponScanPayload('WELCOME10')).toBe(false)
  })
})
