import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MEMBER_STAMP_POLICY,
  displayMemberStampCount,
  isStampChannelAllowed,
  normalizeMemberStampPolicy,
  resolveEffectiveStampPolicy,
} from '@/lib/member-stamp-card'

describe('member-stamp-card', () => {
  it('normalizes policy with defaults', () => {
    expect(normalizeMemberStampPolicy({})).toEqual(DEFAULT_MEMBER_STAMP_POLICY)
    expect(
      normalizeMemberStampPolicy({
        enabled: true,
        cardSlots: 99,
        earnMode: 'order',
        resetAfterComplete: false,
        minOrderAmt: 150,
        cardExpiryDays: 45,
        lineNotifyEnabled: false,
        allowedChannels: ['dine_in', 'member_portal'],
        completeBonusPoints: 20,
      })
    ).toMatchObject({
      enabled: true,
      cardSlots: 30,
      earnMode: 'order',
      resetAfterComplete: false,
      minOrderAmt: 150,
      cardExpiryDays: 45,
      lineNotifyEnabled: false,
      completeBonusPoints: 20,
    })
  })

  it('computes display stamp count for reset vs accumulate', () => {
    expect(displayMemberStampCount(3, 10, true)).toBe(3)
    expect(displayMemberStampCount(12, 10, true)).toBe(10)
    expect(displayMemberStampCount(11, 10, false)).toBe(1)
  })

  it('resolves store override policy', () => {
    const global = normalizeMemberStampPolicy({
      enabled: true,
      cardSlots: 10,
      storeOverrides: {
        'CM001': { enabled: false, minOrderAmt: 200 },
      },
    })
    const effective = resolveEffectiveStampPolicy(global, 'CM001')
    expect(effective.enabled).toBe(false)
    expect(effective.minOrderAmt).toBe(200)
  })

  it('checks allowed channels', () => {
    const policy = normalizeMemberStampPolicy({
      allowedChannels: ['dine_in'],
    })
    expect(isStampChannelAllowed(policy, 'dine_in')).toBe(true)
    expect(isStampChannelAllowed(policy, 'takeout')).toBe(false)
  })
})
