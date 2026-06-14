import { describe, expect, it } from 'vitest'
import { shouldCreateFranchiseReceivableSubledgerFromBankReceive } from './franchise-receivable-subledger-gate'

describe('shouldCreateFranchiseReceivableSubledgerFromBankReceive', () => {
  it('skips when channel settlement is linked', () => {
    expect(
      shouldCreateFranchiseReceivableSubledgerFromBankReceive({
        linkedToChannelSettlement: true,
        hasPosCompletedOrders: false,
      })
    ).toBe(false)
  })

  it('skips POS stores (매출 수령 — 1130 only)', () => {
    expect(
      shouldCreateFranchiseReceivableSubledgerFromBankReceive({
        linkedToChannelSettlement: false,
        hasPosCompletedOrders: true,
      })
    ).toBe(false)
  })

  it('creates subledger for non-POS franchise B2B collection', () => {
    expect(
      shouldCreateFranchiseReceivableSubledgerFromBankReceive({
        linkedToChannelSettlement: false,
        hasPosCompletedOrders: false,
      })
    ).toBe(true)
  })
})
