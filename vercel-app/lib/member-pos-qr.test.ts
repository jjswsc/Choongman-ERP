import { describe, expect, it } from 'vitest'
import { isMemberPosScanPayload, parseMemberPosScanInput } from '@/lib/member-pos-qr'

describe('member-pos-qr', () => {
  it('parses plain member number from member app QR', () => {
    expect(parseMemberPosScanInput('M0007359')).toEqual({ memberNo: 'M0007359' })
    expect(isMemberPosScanPayload('M0007359')).toBe(true)
  })

  it('parses structured member QR with scanner delimiters', () => {
    expect(parseMemberPosScanInput('CM|MEM|M0007359')).toEqual({ memberNo: 'M0007359' })
    expect(parseMemberPosScanInput('CM~MEM~M0007359')).toEqual({ memberNo: 'M0007359' })
    expect(parseMemberPosScanInput('CM-MEM-M0007359')).toEqual({ memberNo: 'M0007359' })
  })

  it('does not treat coupon QR as member-only scan', () => {
    expect(parseMemberPosScanInput('CM|CPN|M0007359|WELCOME10|42')).toBeNull()
    expect(parseMemberPosScanInput('HBDCOUPON~504')).toBeNull()
  })

  it('rejects non-member tokens', () => {
    expect(parseMemberPosScanInput('WELCOME10')).toBeNull()
    expect(parseMemberPosScanInput('0812345678')).toBeNull()
  })
})
