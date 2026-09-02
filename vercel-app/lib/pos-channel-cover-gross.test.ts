import { describe, expect, it } from 'vitest'
import {
  appendCoverMemo,
  claimedCoverDatesFromSettlements,
  isPlausibleCoverFee,
  isWeekendBatchSettleDate,
  parseCoverDatesFromText,
  pickGrossCoveringNet,
} from './pos-channel-cover-gross'

describe('weekend batch GROSS cover', () => {
  it('treats Fri–Mon as weekend batch days, not Tue–Thu', () => {
    expect(isWeekendBatchSettleDate('2026-08-28')).toBe(true)
    expect(isWeekendBatchSettleDate('2026-08-29')).toBe(true)
    expect(isWeekendBatchSettleDate('2026-08-30')).toBe(true)
    expect(isWeekendBatchSettleDate('2026-08-31')).toBe(true)
    expect(isWeekendBatchSettleDate('2026-09-01')).toBe(false)
    expect(isWeekendBatchSettleDate('2026-09-02')).toBe(false)
  })

  it('does not expand a weekday when GROSS < NET', () => {
    expect(
      pickGrossCoveringNet({
        settleDate: '2026-09-01',
        net: 13259.86,
        channel: 'card',
        grossByDate: { '2026-09-01': 10426, '2026-09-02': 4000 },
      })
    ).toBeNull()
  })

  it('keeps a single Saturday when GROSS already covers NET with a card-like fee', () => {
    const pick = pickGrossCoveringNet({
      settleDate: '2026-08-29',
      net: 10200,
      channel: 'card',
      grossByDate: { '2026-08-29': 10426 },
    })
    expect(pick).toEqual({
      coverDates: ['2026-08-29'],
      gross: 10426,
      fee: 226,
    })
    expect(isPlausibleCoverFee('card', 10426, 10200)).toBe(true)
  })

  it('sums Saturday + Sunday when one day is short and the fee stays in band', () => {
    const pick = pickGrossCoveringNet({
      settleDate: '2026-08-29',
      net: 13259.86,
      channel: 'card',
      grossByDate: {
        '2026-08-28': 500,
        '2026-08-29': 10426,
        '2026-08-30': 3000,
        '2026-08-31': 9000,
      },
    })
    expect(pick?.coverDates).toEqual(['2026-08-29', '2026-08-30'])
    expect(pick?.gross).toBe(13426)
    expect(pick?.fee).toBe(166.14)
  })

  it('skips a Sunday already covered by another settlement', () => {
    const pick = pickGrossCoveringNet({
      settleDate: '2026-08-31',
      net: 13259.86,
      channel: 'card',
      claimedDates: ['2026-08-29', '2026-08-30'],
      grossByDate: {
        '2026-08-29': 10426,
        '2026-08-30': 3000,
        '2026-08-31': 10426,
        '2026-09-01': 3200,
      },
    })
    expect(pick?.coverDates).toEqual(['2026-08-31', '2026-09-01'])
  })

  it('rejects a two-day sum whose implied fee is not a card MDR', () => {
    expect(
      pickGrossCoveringNet({
        settleDate: '2026-08-29',
        net: 13259.86,
        channel: 'card',
        grossByDate: {
          '2026-08-29': 10426,
          '2026-08-30': 20000,
        },
      })
    ).toBeNull()
  })

  it('parses and writes [cover …] without duplicating', () => {
    expect(parseCoverDatesFromText('Credit Card Sales [cover 2026-08-29,2026-08-30]')).toEqual([
      '2026-08-29',
      '2026-08-30',
    ])
    expect(appendCoverMemo('Credit Card Sales', ['2026-08-29', '2026-08-30'])).toBe(
      'Credit Card Sales [cover 2026-08-29,2026-08-30]'
    )
    expect(
      claimedCoverDatesFromSettlements([
        { settle_date: '2026-08-29', memo: 'Card [cover 2026-08-29,2026-08-30]' },
      ])
    ).toEqual(new Set(['2026-08-29', '2026-08-30']))
  })
})
