import { describe, expect, it } from 'vitest'
import { isPosBusinessOpenRecorded } from '@/lib/pos-business-open-gate'

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
