import { describe, expect, it } from 'vitest'
import { applyLocalHrPolicyReads, parseLocalConfirmedHrPolicyIds } from './hr-policy-read-local'

describe('parseLocalConfirmedHrPolicyIds', () => {
  it('keeps valid ids and drops junk', () => {
    expect(parseLocalConfirmedHrPolicyIds('[3, "4", 0, "x"]')).toEqual([3, 4])
  })
})

describe('applyLocalHrPolicyReads', () => {
  it('marks locally confirmed policies as read and clears reconfirm', () => {
    const items = [
      { id: 10, status: 'New', needsReconfirm: true },
      { id: 11, status: 'New', needsReconfirm: false },
    ]
    const next = applyLocalHrPolicyReads(items, [10])
    expect(next[0]).toEqual({ id: 10, status: '확인', needsReconfirm: false })
    expect(next[1]).toEqual({ id: 11, status: 'New', needsReconfirm: false })
  })
})
