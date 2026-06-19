import { describe, expect, it } from 'vitest'
import {
  posOrderToCheckoutMemberSnapshot,
  resolvePosOrderMemberFieldsForAddonUpdate,
} from '@/lib/pos-existing-order-checkout-member'

describe('resolvePosOrderMemberFieldsForAddonUpdate', () => {
  it('keeps existing member when cart payload omits member', () => {
    expect(
      resolvePosOrderMemberFieldsForAddonUpdate({}, { memberId: 42, memberNo: 'M001', pointUsed: 0 })
    ).toEqual({ memberId: 42, memberNo: 'M001' })
  })

  it('prefers cart member when selected', () => {
    expect(
      resolvePosOrderMemberFieldsForAddonUpdate(
        { memberId: 99, memberNo: 'M099' },
        { memberId: 42, memberNo: 'M001' }
      )
    ).toEqual({ memberId: 99, memberNo: 'M099' })
  })

  it('preserves existing pointUsed when payload omits it', () => {
    expect(
      resolvePosOrderMemberFieldsForAddonUpdate({}, { memberId: 1, memberNo: 'M1', pointUsed: 50 })
    ).toEqual({ memberId: 1, memberNo: 'M1', pointUsed: 50 })
  })
})

describe('posOrderToCheckoutMemberSnapshot', () => {
  it('returns empty object when order has no member', () => {
    expect(posOrderToCheckoutMemberSnapshot({})).toEqual({})
  })
})
