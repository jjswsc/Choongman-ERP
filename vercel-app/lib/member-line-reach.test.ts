import { describe, expect, it } from 'vitest'
import {
  isActiveLineProviderIdentity,
  parseMemberLineReach,
  rankMemberLineIdentities,
} from '@/lib/member-line-reach'

describe('parseMemberLineReach', () => {
  it('maps known filters and ignores the rest', () => {
    expect(parseMemberLineReach('reachable')).toBe('reachable')
    expect(parseMemberLineReach('linked')).toBe('reachable')
    expect(parseMemberLineReach('unreachable')).toBe('unreachable')
    expect(parseMemberLineReach('unlinked')).toBe('unreachable')
    expect(parseMemberLineReach('')).toBe('all')
    expect(parseMemberLineReach('all')).toBe('all')
    expect(parseMemberLineReach('nope')).toBe('all')
  })
})

describe('isActiveLineProviderIdentity', () => {
  it('requires an active LINE user id', () => {
    expect(isActiveLineProviderIdentity(null)).toBe(false)
    expect(isActiveLineProviderIdentity({ provider_user_id: '', status: 'active' })).toBe(false)
    expect(isActiveLineProviderIdentity({ provider_user_id: 'U123', status: 'inactive' })).toBe(false)
    expect(isActiveLineProviderIdentity({ provider_user_id: 'U123', status: 'active' })).toBe(true)
    expect(isActiveLineProviderIdentity({ provider_user_id: 'U123', status: '' })).toBe(true)
  })
})

describe('rankMemberLineIdentities', () => {
  it('puts the newest active LINE id ahead of an older active import', () => {
    const ranked = rankMemberLineIdentities([
      {
        id: 1,
        provider_user_id: 'U-old-b3e8',
        status: 'active',
        last_seen_at: '2026-01-01 00:00:00',
      },
      {
        id: 2,
        provider_user_id: 'U-new-f245',
        status: 'active',
        last_seen_at: '2026-10-06 10:00:00',
      },
    ])
    expect(ranked.map((row) => row.provider_user_id)).toEqual(['U-new-f245', 'U-old-b3e8'])
  })

  it('keeps an older active id ahead of a newer inactive id', () => {
    const ranked = rankMemberLineIdentities([
      {
        id: 9,
        provider_user_id: 'U-inactive',
        status: 'inactive',
        last_seen_at: '2026-10-06 10:00:00',
      },
      {
        id: 3,
        provider_user_id: 'U-active',
        status: 'active',
        last_seen_at: '2026-01-01 00:00:00',
      },
    ])
    expect(ranked[0]?.provider_user_id).toBe('U-active')
  })

  it('breaks a last_seen tie by the larger identity id', () => {
    const ranked = rankMemberLineIdentities([
      { id: 4, provider_user_id: 'U-low', status: 'active', last_seen_at: '2026-10-06 10:00:00' },
      { id: 8, provider_user_id: 'U-high', status: 'active', last_seen_at: '2026-10-06 10:00:00' },
    ])
    expect(ranked.map((row) => row.provider_user_id)).toEqual(['U-high', 'U-low'])
  })
})
