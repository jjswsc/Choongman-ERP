import { describe, expect, it } from 'vitest'
import type { PortalCouponOfferStatus } from '@/lib/member-portal-coupon-claim'

function resolveOfferStatus(params: {
  claimMode: 'free' | 'points'
  pointCost: number
  pointBalance: number
  claimCount: number
  maxClaims: number
  activeIssueId: number | null
}): PortalCouponOfferStatus {
  if (params.activeIssueId) return 'active_in_wallet'
  if (params.claimCount >= params.maxClaims) return 'max_claims_reached'
  if (params.claimMode === 'points' && params.pointBalance < params.pointCost) return 'insufficient_points'
  return 'claimable'
}

describe('member portal coupon offer status', () => {
  it('marks active issued coupon as in wallet', () => {
    expect(
      resolveOfferStatus({
        claimMode: 'free',
        pointCost: 0,
        pointBalance: 100,
        claimCount: 1,
        maxClaims: 3,
        activeIssueId: 42,
      })
    ).toBe('active_in_wallet')
  })

  it('blocks when max claims reached', () => {
    expect(
      resolveOfferStatus({
        claimMode: 'free',
        pointCost: 0,
        pointBalance: 100,
        claimCount: 1,
        maxClaims: 1,
        activeIssueId: null,
      })
    ).toBe('max_claims_reached')
  })

  it('shows insufficient points for point offers', () => {
    expect(
      resolveOfferStatus({
        claimMode: 'points',
        pointCost: 20,
        pointBalance: 5,
        claimCount: 0,
        maxClaims: 1,
        activeIssueId: null,
      })
    ).toBe('insufficient_points')
  })

  it('allows claim when points are enough', () => {
    expect(
      resolveOfferStatus({
        claimMode: 'points',
        pointCost: 10,
        pointBalance: 10,
        claimCount: 0,
        maxClaims: 1,
        activeIssueId: null,
      })
    ).toBe('claimable')
  })
})
