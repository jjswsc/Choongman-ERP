import { describe, expect, it } from 'vitest'
import { suggestDepositFromMemo } from './suggest-deposit-from-memo'

describe('suggestDepositFromMemo', () => {
  it('maps Grab/Visa to receivable_receive by default (POS 4110 double-count)', () => {
    expect(suggestDepositFromMemo('GRABFOOD UNION', []).category).toBe('receivable_receive')
    expect(suggestDepositFromMemo('VISA SETTLEMENT', []).category).toBe('receivable_receive')
  })

  it('keeps revenue_* only when preferReceivableClearing is false', () => {
    expect(
      suggestDepositFromMemo('GRABFOOD', [], { preferReceivableClearing: false })?.category
    ).toBe('revenue_delivery')
  })
})
