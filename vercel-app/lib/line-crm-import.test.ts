import { describe, expect, it } from 'vitest'
import {
  mergeLineCrmImportMemberPatch,
  pickHigherMemberTierCode,
  registerBatchBirthDateMember,
  resolveBatchBirthDateMemberId,
  resolveLineCrmMemberPointPatch,
} from '@/lib/line-crm-import'

describe('resolveLineCrmMemberPointPatch', () => {
  it('maps current points to point_balance even when zero', () => {
    const patch = resolveLineCrmMemberPointPatch({
      hasCurrentPointsCol: true,
      hasTotalPointsCol: true,
      hasTierPointsCol: true,
      currentPoints: 0,
      totalPoints: 120,
      tierPoints: 80,
    })
    expect(patch.point_balance).toBe(0)
    expect(patch.line_total_points).toBe(120)
    expect(patch.tier_points).toBe(80)
    expect(patch.line_tier_points).toBe(80)
  })

  it('falls back total points to tier_points when tier column is absent', () => {
    const patch = resolveLineCrmMemberPointPatch({
      hasCurrentPointsCol: true,
      hasTotalPointsCol: true,
      hasTierPointsCol: false,
      currentPoints: 25.5,
      totalPoints: 300,
      tierPoints: 0,
    })
    expect(patch.point_balance).toBe(25.5)
    expect(patch.tier_points).toBe(300)
    expect(patch.line_tier_points).toBeUndefined()
    expect(patch.line_total_points).toBe(300)
  })

  it('skips point_balance when current points column is missing', () => {
    const patch = resolveLineCrmMemberPointPatch({
      hasCurrentPointsCol: false,
      hasTotalPointsCol: true,
      hasTierPointsCol: false,
      currentPoints: 0,
      totalPoints: 50,
      tierPoints: 0,
    })
    expect(patch.point_balance).toBeUndefined()
    expect(patch.tier_points).toBe(50)
  })
})

describe('pickHigherMemberTierCode', () => {
  it('keeps silver over bronze', () => {
    expect(pickHigherMemberTierCode('BRONZE', 'SILVER')).toBe('SILVER')
    expect(pickHigherMemberTierCode('SILVER', 'BRONZE')).toBe('SILVER')
  })
})

describe('mergeLineCrmImportMemberPatch', () => {
  it('does not downgrade tier or points', () => {
    const merged = mergeLineCrmImportMemberPatch({
      existing: {
        tier_code: 'SILVER',
        point_balance: 150,
        tier_points: 151,
        line_current_points: 78,
      },
      incoming: {
        tier_code: 'BRONZE',
        point_balance: 30,
        tier_points: 30,
        line_current_points: 30,
        phone: '0946387882',
      },
      importCurrentPoints: 30,
    })
    expect(merged.tier_code).toBe('SILVER')
    expect(merged.point_balance).toBe(150)
    expect(merged.tier_points).toBe(151)
    expect(merged.line_current_points).toBe(78)
  })

  it('keeps existing phone when it has more points than import row', () => {
    const merged = mergeLineCrmImportMemberPatch({
      existing: {
        phone: '0967185451',
        point_balance: 150,
        tier_points: 151,
      },
      incoming: {
        phone: '0946387882',
        point_balance: 30,
        tier_points: 30,
      },
      importCurrentPoints: 30,
    })
    expect(merged.phone).toBeUndefined()
    expect(merged.point_balance).toBe(150)
  })
})

describe('batch birth_date dedupe', () => {
  it('reuses member id within same customer import batch', () => {
    const map = new Map<string, number>()
    registerBatchBirthDateMember(map, '2002-10-11', 10850, 'customer')
    expect(resolveBatchBirthDateMemberId(map, '2002-10-11', 'customer')).toBe(10850)
    expect(resolveBatchBirthDateMemberId(map, '2002-10-11', 'point')).toBe(0)
  })
})
