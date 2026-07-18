import { describe, expect, it } from 'vitest'
import { couponIssueEligibleForOrderTime } from '@/lib/member-portal-coupon-status'

describe('member-portal-coupon-repair policy', () => {
  it('treats duplicate used rows on same order as invalid when all issued after payment', () => {
    const orderPaidAt = '2026-06-30 13:05:00'
    const issues = [
      '2026-06-30 13:07:07',
      '2026-06-30 13:07:08',
      '2026-06-30 13:07:19',
    ]
    expect(issues.every((issuedAt) => !couponIssueEligibleForOrderTime(issuedAt, orderPaidAt))).toBe(true)
  })

  it('keeps a single false-positive row eligible to become issued again (Jayle case)', () => {
    expect(couponIssueEligibleForOrderTime('2026-06-30 13:08:00', '2026-06-30 13:06:00')).toBe(false)
  })

  it('keeps one legitimate used row when issued before payment among duplicates', () => {
    const orderPaidAt = '2026-06-30 13:07:30'
    expect(couponIssueEligibleForOrderTime('2026-06-30 13:07:07', orderPaidAt)).toBe(true)
    expect(couponIssueEligibleForOrderTime('2026-06-30 13:07:19', orderPaidAt)).toBe(true)
  })

  it('does not false-positive when paid_at is UTC ISO and issued_at is Bangkok wall clock', () => {
    // 영수증 19:09 방콕 / paid_at UTC 12:09 — 당일 오후 교환 쿠폰이 used→issued 로 되돌아가면 안 됨
    expect(
      couponIssueEligibleForOrderTime('2026-07-18 18:50:00', '2026-07-18T12:09:08.000Z')
    ).toBe(true)
  })
})
