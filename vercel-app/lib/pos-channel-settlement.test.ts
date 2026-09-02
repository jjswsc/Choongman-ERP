import { describe, expect, it } from 'vitest'
import { linesForPosChannelSettlement } from './pos-channel-settlement'

describe('linesForPosChannelSettlement', () => {
  it('posts bank + fee + 1130 when bank net is not yet posted', () => {
    const lines = linesForPosChannelSettlement({
      channel: 'lineman',
      gross: 1000,
      fee: 200,
      net: 800,
    })
    expect(lines.map((l) => [l.accountCode, l.side, l.amount])).toEqual([
      ['1010', 'debit', 800],
      ['5528', 'debit', 200],
      ['1130', 'credit', 1000],
    ])
  })

  it('posts fee only when sales collection already cleared NET', () => {
    const lines = linesForPosChannelSettlement({
      channel: 'lineman',
      gross: 1000,
      fee: 200,
      net: 800,
      bankNetAlreadyPosted: true,
    })
    expect(lines.map((l) => [l.accountCode, l.side, l.amount])).toEqual([
      ['5528', 'debit', 200],
      ['1130', 'credit', 200],
    ])
  })

  it('skips fee-only journal when fee is ~0 (QR-like)', () => {
    expect(
      linesForPosChannelSettlement({
        channel: 'card',
        gross: 500,
        fee: 0,
        net: 500,
        bankNetAlreadyPosted: true,
      })
    ).toEqual([])
  })
})
