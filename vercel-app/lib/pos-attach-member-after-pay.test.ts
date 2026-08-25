import { describe, expect, it } from 'vitest'
import { resolveAttachMemberAfterPayEligibility } from '@/lib/pos-attach-member-after-pay'

const base = {
  status: 'completed',
  total: 467,
  paymentCash: 467,
  paymentCard: 0,
  paymentQr: 0,
  paymentOther: 0,
  paymentDeliveryApp: 0,
  memberId: 0,
  memberNo: '',
  pointEarned: 0,
  pointUsed: 0,
  mergedAbsorb: false,
  orderBusinessDay: '2026-08-25',
  todayBusinessDay: '2026-08-25',
  yesterdayBusinessDay: '2026-08-24',
}

describe('resolveAttachMemberAfterPayEligibility', () => {
  it('allows attaching a member on a same-day paid order with no member', () => {
    expect(resolveAttachMemberAfterPayEligibility(base)).toEqual({
      code: 'ok_attach',
      canAttach: true,
      canRetry: false,
    })
  })

  it('allows retry when member is already linked but points were not earned', () => {
    expect(
      resolveAttachMemberAfterPayEligibility({
        ...base,
        memberId: 12,
        memberNo: 'CM000012',
      })
    ).toEqual({
      code: 'ok_retry',
      canAttach: false,
      canRetry: true,
    })
  })

  it('allows yesterday business-day orders', () => {
    expect(
      resolveAttachMemberAfterPayEligibility({
        ...base,
        orderBusinessDay: '2026-08-24',
      }).code
    ).toBe('ok_attach')
  })

  it('blocks older than yesterday', () => {
    expect(
      resolveAttachMemberAfterPayEligibility({
        ...base,
        orderBusinessDay: '2026-08-23',
      }).code
    ).toBe('outside_window')
  })

  it('blocks cancelled and unpaid orders', () => {
    expect(resolveAttachMemberAfterPayEligibility({ ...base, status: 'cancelled' }).code).toBe(
      'status'
    )
    expect(resolveAttachMemberAfterPayEligibility({ ...base, paymentCash: 0 }).code).toBe('not_paid')
  })

  it('blocks merged absorb and already-earned orders', () => {
    expect(resolveAttachMemberAfterPayEligibility({ ...base, mergedAbsorb: true }).code).toBe(
      'merged'
    )
    expect(
      resolveAttachMemberAfterPayEligibility({
        ...base,
        memberId: 9,
        pointEarned: 4.67,
      }).code
    ).toBe('already_earned')
  })
})
