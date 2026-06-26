import { describe, expect, it } from 'vitest'
import { posScanFieldFlashClass } from '@/lib/pos-scan-feedback'
import { previewPosScanPayload } from '@/lib/pos-scan-parse-preview'

describe('pos-scan-parse-preview', () => {
  it('detects member payload', () => {
    expect(previewPosScanPayload('CM|MEM|M0007359')).toMatchObject({
      kind: 'member',
      memberNo: 'M0007359',
    })
  })

  it('detects coupon payload', () => {
    expect(previewPosScanPayload('CM|CPN|M0007359|WELCOME10|42')).toMatchObject({
      kind: 'coupon',
      memberNo: 'M0007359',
      couponCode: 'WELCOME10',
      issueId: 42,
    })
  })
})

describe('posScanFieldFlashClass', () => {
  it('returns classes for outcomes', () => {
    expect(posScanFieldFlashClass('success')).toContain('emerald')
    expect(posScanFieldFlashClass('error')).toContain('destructive')
    expect(posScanFieldFlashClass(null)).toBe('')
  })
})
