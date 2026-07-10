import { describe, expect, it } from 'vitest'
import { resolveLineCrmMemberPointPatch } from '@/lib/line-crm-import'

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
