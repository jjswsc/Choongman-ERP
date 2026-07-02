import { describe, expect, it } from 'vitest'
import { sumExpenseSubjectAmounts } from '@/lib/accounting-reports'

describe('sumExpenseSubjectAmounts', () => {
  it('matches petty + bank + fixed plus inbound expense-routed lines', () => {
    const map = new Map<number | null, number>([
      [10, 38592],
      [20, 26654],
      [30, 6431],
      [null, 1373],
      // 입고 품목이 비용 계정으로 분류된 금액 — 기존에는 총 비용에서 누락됨
      [40, 17679],
    ])
    expect(sumExpenseSubjectAmounts(map)).toBe(90729)
    const pettyBankFixed = 38592 + 26654 + 6431 + 1373
    expect(pettyBankFixed).toBe(73050)
    expect(sumExpenseSubjectAmounts(map)).toBeGreaterThan(pettyBankFixed)
  })
})
