import { describe, expect, it } from 'vitest'
import { linesForPosChannelSettlement, settlementPostedMatchesForm } from './pos-channel-settlement'

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

  it('treats Posted vs form as a mismatch when FEE/NET were stored inverted', () => {
    expect(
      settlementPostedMatchesForm(
        { gross: 9913, fee: 9043.09, net: 869.91 },
        { gross: 9913, fee: 486.82, net: 9426.18 }
      )
    ).toBe(false)
    expect(
      settlementPostedMatchesForm(
        { gross: 9913, fee: 486.82, net: 9426.18 },
        { gross: 9913, fee: 486.82, net: 9426.18 }
      )
    ).toBe(true)
  })
})
