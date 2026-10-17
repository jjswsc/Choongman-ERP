import { describe, expect, it } from 'vitest'
import {
  cashSalesVsTillNetGap,
  shouldAutoAlignSettlementCashToLive,
  shouldExplainDepositDrawerVariance,
  shouldWarnCashSalesVsTill,
} from '@/lib/pos-settlement-cash-ops-hints'

describe('shouldWarnCashSalesVsTill', () => {
  it('Silom: cash sales 4227 vs till out 5543', () => {
    expect(cashSalesVsTillNetGap(4227, -5543)).toBe(-1316)
    expect(shouldWarnCashSalesVsTill(4227, -5543)).toBe(true)
  })

  it('Future: cash out matches cash sales', () => {
    expect(cashSalesVsTillNetGap(1234, -1234)).toBe(0)
    expect(shouldWarnCashSalesVsTill(1234, -1234)).toBe(false)
  })

  it('no till activity', () => {
    expect(shouldWarnCashSalesVsTill(4227, 0)).toBe(false)
  })
})

describe('shouldExplainDepositDrawerVariance', () => {
  it('Future deposit test: drawer −5010 with deposit +5010', () => {
    expect(shouldExplainDepositDrawerVariance(5010, -5010)).toBe(true)
  })

  it('Silom drawer +1316 is not deposit pattern', () => {
    expect(shouldExplainDepositDrawerVariance(0, 1316)).toBe(false)
    expect(shouldExplainDepositDrawerVariance(5010, 1316)).toBe(false)
  })
})

describe('shouldAutoAlignSettlementCashToLive', () => {
  it('aligns Silom payment-correct leftover and Future deposit-mixed cash_amt', () => {
    expect(shouldAutoAlignSettlementCashToLive(5543, 4227)).toBe(true)
    expect(shouldAutoAlignSettlementCashToLive(6244, 1234)).toBe(true)
  })

  it('skips when already matched', () => {
    expect(shouldAutoAlignSettlementCashToLive(4227, 4227)).toBe(false)
  })
})
