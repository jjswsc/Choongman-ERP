import { describe, expect, it } from 'vitest'
import { isPosBusinessOpenRecorded, shouldKeepPosBusinessOpenOnQuietRecheck } from '@/lib/pos-business-open-gate'

describe('isPosBusinessOpenRecorded', () => {
  it('returns false when settlement is missing', () => {
    expect(isPosBusinessOpenRecorded(null)).toBe(false)
    expect(isPosBusinessOpenRecorded(undefined)).toBe(false)
  })

  it('returns false when cashActual was never saved', () => {
    expect(
      isPosBusinessOpenRecorded({
        storeCode: 'ST01',
        settleDate: '2026-05-23',
        cashActual: null,
        cardAmt: 0,
        qrAmt: 0,
        deliveryAppAmt: 0,
        otherAmt: 0,
        memo: '',
        closed: false,
      })
    ).toBe(false)
  })

  it('returns true when cashActual is saved (including zero float)', () => {
    expect(
      isPosBusinessOpenRecorded({
        storeCode: 'ST01',
        settleDate: '2026-05-23',
        cashActual: 0,
        cardAmt: 0,
        qrAmt: 0,
        deliveryAppAmt: 0,
        otherAmt: 0,
        memo: '',
        closed: false,
      })
    ).toBe(true)
    expect(
      isPosBusinessOpenRecorded({
        storeCode: 'ST01',
        settleDate: '2026-05-23',
        cashActual: 1500,
        cardAmt: 0,
        qrAmt: 0,
        deliveryAppAmt: 0,
        otherAmt: 0,
        memo: '',
        closed: false,
      })
    ).toBe(true)
  })
})

describe('shouldKeepPosBusinessOpenOnQuietRecheck', () => {
  it('keeps a completed open when quiet recheck reports never_opened', () => {
    expect(
      shouldKeepPosBusinessOpenOnQuietRecheck({
        previouslyAllowed: true,
        resultAllowed: false,
        blockReason: 'never_opened',
      })
    ).toBe(true)
  })

  it('blocks when a new business day is confirmed', () => {
    expect(
      shouldKeepPosBusinessOpenOnQuietRecheck({
        previouslyAllowed: true,
        resultAllowed: false,
        blockReason: 'new_business_day',
      })
    ).toBe(false)
  })

  it('does not keep closed when this session was never open', () => {
    expect(
      shouldKeepPosBusinessOpenOnQuietRecheck({
        previouslyAllowed: false,
        resultAllowed: false,
        blockReason: 'never_opened',
      })
    ).toBe(false)
  })
})
