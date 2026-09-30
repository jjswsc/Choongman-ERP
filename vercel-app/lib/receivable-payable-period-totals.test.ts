import { describe, expect, it } from 'vitest'
import {
  pairReceivableLedgerDates,
  pairPayableLedgerDates,
  groupReceivableLedgerRows,
  groupPayableLedgerRows,
  isPayableSettlementRow,
  buildLedgerRowGroupMeta,
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

describe('pairPayableLedgerDates', () => {
  it('pairs inbound and payment rows by amount', () => {
    const pairs = pairPayableLedgerDates([
      { id: 1, ref_type: 'Inbound', amount: 891124.04, trans_date: '2026-04-01' },
      { id: 2, ref_type: 'Payment', amount: -891124.04, trans_date: '2026-04-10' },
    ])
    expect(pairs.get(1)).toEqual({ purchaseDate: '2026-04-01', paymentDate: '2026-04-10' })
    expect(pairs.get(2)).toEqual({ purchaseDate: '2026-04-01', paymentDate: '2026-04-10' })
  })

  it('leaves accrual-only rows with purchase date only', () => {
    const pairs = pairPayableLedgerDates([
      { id: 3, ref_type: 'Inbound', amount: 50000, trans_date: '2026-05-10' },
    ])
    expect(pairs.get(3)).toEqual({ purchaseDate: '2026-05-10' })
  })
})

describe('groupReceivableLedgerRows', () => {
  it('groups order and receive into one block', () => {
    const groups = groupReceivableLedgerRows([
      { id: 1, ref_type: 'Order', amount: 50000, trans_date: '2026-04-01' },
      { id: 2, ref_type: 'Receive', ref_id: 1, amount: -50000, trans_date: '2026-04-20' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].status).toBe('settled')
    expect(groups[0].accrual?.id).toBe(1)
    expect(groups[0].settlements[0]?.id).toBe(2)
  })

  it('marks unmatched accrual as open', () => {
    const groups = groupReceivableLedgerRows([
      { id: 3, ref_type: 'Order', amount: 12000, trans_date: '2026-05-10' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].status).toBe('open')
    expect(groups[0].openAmount).toBe(12000)
  })
})

describe('groupPayableLedgerRows', () => {
  it('groups inbound and payment into one block', () => {
    const groups = groupPayableLedgerRows([
      { id: 1, ref_type: 'Inbound', amount: 891124.04, trans_date: '2026-04-01' },
      { id: 2, ref_type: 'Payment', amount: -891124.04, trans_date: '2026-04-10' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].status).toBe('settled')
  })

  it('keeps withholding out of the payment pair and still reduces the net', () => {
    const rows = [
      { id: 1, ref_type: 'Inbound', amount: 104860, trans_date: '2026-07-20' },
      { id: 2, ref_type: 'Payment', amount: -101920, trans_date: '2026-07-21' },
      { id: 3, ref_type: 'Withholding', amount: -2940, trans_date: '2026-07-21' },
    ]
    expect(isPayableSettlementRow('Withholding', -2940)).toBe(false)
    const groups = groupPayableLedgerRows(rows)
    const inbound = groups.find((g) => g.accrual?.id === 1)
    expect(inbound?.status).toBe('open')
    expect(inbound?.settlements).toHaveLength(0)
    const totals = sumReceivablePayablePeriodAmounts(rows)
    expect(totals.periodNet).toBe(0)
    expect(totals.salesSum).toBe(104860)
    expect(totals.receiveSum).toBe(104860)
  })
})

describe('buildLedgerRowGroupMeta', () => {
  it('maps accrual and settlement row ids to roles', () => {
    const groups = groupReceivableLedgerRows([
      { id: 1, ref_type: 'Order', amount: 100, trans_date: '2026-01-01' },
      { id: 2, ref_type: 'Receive', ref_id: 1, amount: -100, trans_date: '2026-01-05' },
    ])
    const meta = buildLedgerRowGroupMeta(groups)
    expect(meta.get(1)).toEqual({ groupId: 1, role: 'accrual' })
    expect(meta.get(2)).toEqual({ groupId: 1, role: 'settlement' })
  })
})
