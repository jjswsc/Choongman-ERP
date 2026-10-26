import { describe, expect, it } from 'vitest'
import {
  formatUnpaidHallOverrideMemoSuffix,
  isOvernightBusinessPayment,
  isValidUnpaidHallOverrideReason,
} from '@/lib/pos-unpaid-hall-guard'

describe('isOvernightBusinessPayment', () => {
  it('detects prior open day', () => {
    expect(isOvernightBusinessPayment('2026-10-25', '2026-10-26')).toBe(true)
    expect(isOvernightBusinessPayment('2026-10-26', '2026-10-26')).toBe(false)
    expect(isOvernightBusinessPayment('2026-10-26', '2026-10-25')).toBe(false)
  })

  it('rejects invalid ymd', () => {
    expect(isOvernightBusinessPayment('', '2026-10-26')).toBe(false)
    expect(isOvernightBusinessPayment('2026-10-25', 'bad')).toBe(false)
  })
})

describe('isValidUnpaidHallOverrideReason', () => {
  it('requires min length', () => {
    expect(isValidUnpaidHallOverrideReason('short')).toBe(false)
    expect(isValidUnpaidHallOverrideReason('ลูกค้าค้างชำระ')).toBe(true)
  })
})

describe('formatUnpaidHallOverrideMemoSuffix', () => {
  it('includes count and reason', () => {
    const s = formatUnpaidHallOverrideMemoSuffix({
      reason: '  guest left unpaid  ',
      actorName: 'Taedsak',
      orderCount: 3,
      atIso: '2026-10-26T12:00:00.000Z',
    })
    expect(s).toContain('n=3')
    expect(s).toContain('Taedsak')
    expect(s).toContain('guest left unpaid')
  })
})
