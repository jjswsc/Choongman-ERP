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

  it('skips POS channel settlement memos (Grab·카드 — 1130 only)', () => {
    expect(
      shouldCreateFranchiseReceivableSubledgerFromBankReceive({
        linkedToChannelSettlement: false,
        hasPosCompletedOrders: true,
        memo: 'Grab settlement NET 193415',
      })
    ).toBe(false)
  })

  it('creates subledger for POS store B2B transfer (non-channel memo)', () => {
    expect(
      shouldCreateFranchiseReceivableSubledgerFromBankReceive({
        linkedToChannelSettlement: false,
        hasPosCompletedOrders: true,
        memo: 'โอนเงินมัดจำ | จาก X2781',
      })
    ).toBe(true)
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
