import { describe, expect, it } from 'vitest'
import { computeMemberPointExpiryState, getMemberPointRetentionCutoffIso } from '@/lib/member-point-expiry'

describe('computeMemberPointExpiryState', () => {
  const cutoff = '2024-06-20 00:00:00'

  it('만 2년 지난 적립분은 등급·잔액 모두 0, 소멸 대상', () => {
    const state = computeMemberPointExpiryState(
      [{ kind: 'earn', points: 100, created_at: '2022-01-01 10:00:00' }],
      cutoff
    )
    expect(state.tierPoints).toBe(0)
    expect(state.pointBalance).toBe(0)
    expect(state.expirePoints).toBe(100)
  })

  it('2년 이내 적립분은 등급·잔액에 반영', () => {
    const state = computeMemberPointExpiryState(
      [{ kind: 'earn', points: 120, created_at: '2025-01-01 10:00:00' }],
      cutoff
    )
    expect(state.tierPoints).toBe(120)
    expect(state.pointBalance).toBe(120)
    expect(state.expirePoints).toBe(0)
  })

  it('오래된 적립분은 사용(FIFO) 후 남은 미사용분만 소멸', () => {
    const state = computeMemberPointExpiryState(
      [
        { kind: 'earn', points: 1000, created_at: '2022-01-01 10:00:00', id: 1 },
        { kind: 'earn', points: 100, created_at: '2025-01-01 10:00:00', id: 2 },
        { kind: 'use', points: -50, created_at: '2025-06-10 10:00:00', id: 3 },
      ],
      cutoff
    )
    expect(state.tierPoints).toBe(100)
    expect(state.pointBalance).toBe(100)
    expect(state.expirePoints).toBe(950)
  })

  it('오래된 적립분을 모두 사용했으면 소멸 없음', () => {
    const state = computeMemberPointExpiryState(
      [
        { kind: 'earn', points: 100, created_at: '2022-01-01 10:00:00', id: 1 },
        { kind: 'use', points: -100, created_at: '2023-01-01 10:00:00', id: 2 },
      ],
      cutoff
    )
    expect(state.tierPoints).toBe(0)
    expect(state.pointBalance).toBe(0)
    expect(state.expirePoints).toBe(0)
  })
})

describe('getMemberPointRetentionCutoffIso', () => {
  it('방콕 기준 2년 전 시각 문자열', () => {
    const cutoff = getMemberPointRetentionCutoffIso(new Date('2026-06-20T12:00:00+07:00'))
    expect(cutoff.startsWith('2024-06-20')).toBe(true)
  })
})

describe('buildMembersWithPointsBatchFilter', () => {
  it('커서 없으면 포인트 보유 회원 전체', async () => {
    const { buildMembersWithPointsBatchFilter } = await import('@/lib/member-point-expiry-batch')
    expect(buildMembersWithPointsBatchFilter(0)).toBe('or=(point_balance.gt.0,tier_points.gt.0)')
  })

  it('커서 이후 회원만 조회', async () => {
    const { buildMembersWithPointsBatchFilter } = await import('@/lib/member-point-expiry-batch')
    expect(buildMembersWithPointsBatchFilter(42)).toBe(
      'or=(point_balance.gt.0,tier_points.gt.0)&id=gt.42'
    )
  })
})
