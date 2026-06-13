import { describe, expect, it } from 'vitest'
import {
  computeMemberPointEarn,
  DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY,
  isWithinMemberBirthdayBonusWindow,
  normalizeMemberPointEarnBonusPolicy,
  resolvePointEarnChannel,
} from '@/lib/member-point-earn-policy'

describe('member-point-earn-policy', () => {
  it('resolves member portal channel from created_by', () => {
    expect(resolvePointEarnChannel({ createdBy: 'member_portal:42', orderType: 'takeout' })).toBe(
      'member_portal'
    )
    expect(resolvePointEarnChannel({ orderType: 'dine_in' })).toBe('dine_in')
    expect(resolvePointEarnChannel({ orderType: 'takeout' })).toBe('takeout')
  })

  it('does not stack multipliers — uses max only', () => {
    const policy = normalizeMemberPointEarnBonusPolicy({
      channelMultipliers: { dine_in: 1, takeout: 1, delivery: 1, member_portal: 2 },
      birthday: { enabled: true, windowDays: 7, multiplier: 2 },
      periodPromo: { enabled: false, startDate: '', endDate: '', multiplier: 3 },
    })
    const result = computeMemberPointEarn({
      totalAmount: 500,
      pointRate: 0.01,
      policy,
      channel: 'member_portal',
      birthDate: '1990-06-15',
      todayYmd: '2026-06-15',
    })
    expect(result.baseEarn).toBe(5)
    expect(result.pointEarned).toBe(10)
    expect(result.effectiveMultiplier).toBe(2)
  })

  it('applies period promo when it is the highest multiplier', () => {
    const policy = normalizeMemberPointEarnBonusPolicy({
      ...DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY,
      channelMultipliers: { dine_in: 1, takeout: 1, delivery: 1, member_portal: 2 },
      periodPromo: {
        enabled: true,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        multiplier: 3,
      },
    })
    const result = computeMemberPointEarn({
      totalAmount: 1000,
      pointRate: 0.01,
      policy,
      channel: 'dine_in',
      todayYmd: '2026-06-10',
    })
    expect(result.baseEarn).toBe(10)
    expect(result.pointEarned).toBe(30)
    expect(result.periodPromoApplied).toBe(true)
  })

  it('checks birthday window ±7 days in Bangkok calendar', () => {
    expect(isWithinMemberBirthdayBonusWindow('1990-03-10', '2026-03-03', 7)).toBe(true)
    expect(isWithinMemberBirthdayBonusWindow('1990-03-10', '2026-03-17', 7)).toBe(true)
    expect(isWithinMemberBirthdayBonusWindow('1990-03-10', '2026-03-18', 7)).toBe(false)
  })
})
