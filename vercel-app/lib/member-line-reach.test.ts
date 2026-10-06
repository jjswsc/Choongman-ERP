import { describe, expect, it } from 'vitest'
import { isActiveLineProviderIdentity, parseMemberLineReach } from '@/lib/member-line-reach'

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
