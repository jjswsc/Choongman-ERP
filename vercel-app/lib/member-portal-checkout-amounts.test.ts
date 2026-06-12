import { describe, expect, it } from 'vitest'
import { resolveMemberPortalPointAndQr } from '@/lib/member-portal-checkout-amounts'

describe('resolveMemberPortalPointAndQr', () => {
  it('uses full points when total is coverable', () => {
    expect(
      resolveMemberPortalPointAndQr({
        totalBeforePoints: 320,
        pointBalance: 500,
        requestedPointUsed: 320,
      })
    ).toEqual({ pointUsed: 320, qrAmount: 0, requiresQr: false })
  })

  it('requires QR for remainder', () => {
    expect(
      resolveMemberPortalPointAndQr({
        totalBeforePoints: 320,
        pointBalance: 500,
        requestedPointUsed: 100,
      })
    ).toEqual({ pointUsed: 100, qrAmount: 220, requiresQr: true })
  })

  it('caps points when QR would be below min 1 baht', () => {
    expect(
      resolveMemberPortalPointAndQr({
        totalBeforePoints: 100.5,
        pointBalance: 200,
        requestedPointUsed: 100,
        minQrBaht: 1,
      })
    ).toEqual({ pointUsed: 99, qrAmount: 1.5, requiresQr: true })
  })

  it('respects point balance cap', () => {
    expect(
      resolveMemberPortalPointAndQr({
        totalBeforePoints: 500,
        pointBalance: 50,
        requestedPointUsed: 500,
      })
    ).toEqual({ pointUsed: 50, qrAmount: 450, requiresQr: true })
  })
})
