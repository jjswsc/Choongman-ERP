import { describe, expect, it } from 'vitest'
import {
  pairReceivableLedgerDates,
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

describe('pairReceivableLedgerDates', () => {
  it('pairs order and receive rows by amount', () => {
    const pairs = pairReceivableLedgerDates([
      { id: 1, ref_type: 'Order', amount: 50000, trans_date: '2026-04-01' },
      { id: 2, ref_type: 'Receive', amount: -50000, trans_date: '2026-04-20' },
    ])
    expect(pairs.get(1)).toEqual({ salesDate: '2026-04-01', receiveDate: '2026-04-20' })
    expect(pairs.get(2)).toEqual({ salesDate: '2026-04-01', receiveDate: '2026-04-20' })
  })

  it('leaves accrual-only rows with sales date only', () => {
    const pairs = pairReceivableLedgerDates([
      { id: 3, ref_type: 'Order', amount: 12000, trans_date: '2026-05-10' },
    ])
    expect(pairs.get(3)).toEqual({ salesDate: '2026-05-10' })
  })

  it('pairs receive rows linked by ref_id to accrual id', () => {
    const pairs = pairReceivableLedgerDates([
      { id: 10, ref_type: 'Order', amount: 50000, trans_date: '2026-04-01' },
      { id: 11, ref_type: 'Receive', ref_id: 10, amount: -50000, trans_date: '2026-04-20' },
    ])
    expect(pairs.get(10)).toEqual({ salesDate: '2026-04-01', receiveDate: '2026-04-20' })
    expect(pairs.get(11)).toEqual({ salesDate: '2026-04-01', receiveDate: '2026-04-20' })
  })
})
