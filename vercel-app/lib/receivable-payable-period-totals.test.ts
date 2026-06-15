import { describe, expect, it } from 'vitest'
import {
  periodTotalsReconcile,
  priorCumulativeBalance,
  sumReceivablePayablePeriodAmounts,
} from './receivable-payable-period-totals'

describe('sumReceivablePayablePeriodAmounts', () => {
  it('splits positive accruals and negative settlements', () => {
    const totals = sumReceivablePayablePeriodAmounts([
      { amount: 802200.61 },
      { amount: -300000 },
      { amount: -237899.85 },
      { amount: 1000 },
    ])
    expect(totals.salesSum).toBe(803200.61)
    expect(totals.receiveSum).toBe(537899.85)
    expect(totals.periodNet).toBe(265300.76)
    expect(periodTotalsReconcile(totals.periodNet, totals.salesSum, totals.receiveSum)).toBe(true)
  })

  it('returns zero totals for empty items', () => {
    expect(sumReceivablePayablePeriodAmounts([])).toEqual({
      salesSum: 0,
      receiveSum: 0,
      periodNet: 0,
      lineCount: 0,
    })
  })
})

describe('priorCumulativeBalance', () => {
  it('derives opening balance before the selected period', () => {
    expect(priorCumulativeBalance(1200, 200)).toBe(1000)
    expect(priorCumulativeBalance(264300.76, 264300.76)).toBe(0)
  })

  it('returns undefined when cumulative is missing', () => {
    expect(priorCumulativeBalance(undefined, 100)).toBeUndefined()
  })
})
