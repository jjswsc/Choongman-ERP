import { describe, expect, it } from 'vitest'
import {
  computeMemberPointExpiryState,
  getMemberPointRetentionCutoffIso,
  LINE_OPENING_CREDIT_NOTE,
  LINE_OPENING_USED_NOTE,
  planLineOpeningLedgerRows,
  resolveLineOpeningCreatedAt,
} from '@/lib/member-point-expiry'

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
    expect(buildMembersWithPointsBatchFilter(0)).toBe(
      'or=(point_balance.gt.0,tier_points.gt.0,line_tier_points.gt.0)'
    )
  })

  it('커서 이후 회원만 조회', async () => {
    const { buildMembersWithPointsBatchFilter } = await import('@/lib/member-point-expiry-batch')
    expect(buildMembersWithPointsBatchFilter(42)).toBe(
      'or=(point_balance.gt.0,tier_points.gt.0,line_tier_points.gt.0)&id=gt.42'
    )
  })
})

describe('LINE CRM 이월 포인트', () => {
  const cutoff = '2024-10-09 00:00:00'

  it('이월 원장이 없으면 등급 누적분 + 와 LINE 사용분 − 를 계획', () => {
    const rows = planLineOpeningLedgerRows({ lineCurrentPoints: 80, lineTierPoints: 150, ledger: [] })
    expect(rows).toEqual([
      { points: 150, note: LINE_OPENING_CREDIT_NOTE },
      { points: -70, note: LINE_OPENING_USED_NOTE },
    ])
  })

  it('비정상적으로 큰 LINE 값은 자동 이월하지 않음', () => {
    expect(planLineOpeningLedgerRows({ lineCurrentPoints: 359860, lineTierPoints: 359860, ledger: [] })).toEqual([])
  })

  it('이미 이월 원장이 맞으면 추가 없음', () => {
    const rows = planLineOpeningLedgerRows({
      lineCurrentPoints: 80,
      lineTierPoints: 150,
      ledger: [
        { points: 150, note: LINE_OPENING_CREDIT_NOTE },
        { points: -70, note: LINE_OPENING_USED_NOTE },
        { points: 5.5, note: 'pos_earn' },
      ],
    })
    expect(rows).toEqual([])
  })

  it('재생 시 이월분 + POS 적립이 합산되고 POS 사용은 차감', () => {
    const rows = planLineOpeningLedgerRows({ lineCurrentPoints: 100, lineTierPoints: 100, ledger: [] })
    const ledger = [
      ...rows.map((r, i) => ({ id: i + 1, kind: 'adjust', points: r.points, created_at: '2026-07-01 00:00:00' })),
      { id: 10, kind: 'earn', points: 20.17, created_at: '2026-08-01 12:00:00' },
      { id: 11, kind: 'use', points: -50, created_at: '2026-08-02 12:00:00' },
    ]
    const state = computeMemberPointExpiryState(ledger, cutoff)
    expect(state.pointBalance).toBe(70.17)
    expect(state.tierPoints).toBe(120.17)
  })

  it('쿠폰 교환(redeem)은 잔액에서 차감', () => {
    const state = computeMemberPointExpiryState(
      [
        { id: 1, kind: 'earn', points: 100, created_at: '2026-08-01 12:00:00' },
        { id: 2, kind: 'redeem', points: -30, created_at: '2026-08-02 12:00:00' },
      ],
      cutoff
    )
    expect(state.pointBalance).toBe(70)
  })

  it('이월 시각은 LINE 내보내기 시점, 기준일보다 과거면 기준일', () => {
    expect(
      resolveLineOpeningCreatedAt({
        lineExportedAt: '2026-06-30T10:00:00',
        earliestLedgerAt: '2026-07-01 09:00:00',
        cutoffIso: cutoff,
        now: '2026-10-09 17:00:00',
      })
    ).toBe('2026-06-30 10:00:00')
    expect(
      resolveLineOpeningCreatedAt({ lineExportedAt: '2020-01-01', cutoffIso: cutoff, now: '2026-10-09 17:00:00' })
    ).toBe(cutoff)
  })
})
