import { describe, expect, it } from 'vitest'
import { isEscPosCutEnabled, resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'

describe('isEscPosCutEnabled', () => {
  it('defaults on when the flag is missing', () => {
    expect(isEscPosCutEnabled(undefined)).toBe(true)
    expect(isEscPosCutEnabled(null)).toBe(true)
    expect(isEscPosCutEnabled(true)).toBe(true)
  })

  it('turns off only when explicitly false', () => {
    expect(isEscPosCutEnabled(false)).toBe(false)
  })
})

describe('resolveEscPosCutOverride', () => {
  it('leaves shell runtime config when settings are missing', () => {
    expect(resolveEscPosCutOverride(null, { printRole: 'kitchen' })).toBeUndefined()
    expect(
      resolveEscPosCutOverride(undefined, { printRole: 'receipt', printReceiptKind: 'hall_order' })
    ).toBeUndefined()
  })

  it('cuts QR hall slips when hall flag is missing (same as kitchen)', () => {
    expect(
      resolveEscPosCutOverride(
        {},
        { printRole: 'receipt', printReceiptKind: 'hall_order' }
      )
    ).toBe(true)
    expect(resolveEscPosCutOverride({}, { printRole: 'kitchen' })).toBe(true)
  })

  it('honors explicit hall/kitchen off', () => {
    expect(
      resolveEscPosCutOverride(
        { escPosCutAfterHallOrderHtml: false },
        { printRole: 'receipt', printReceiptKind: 'hall_order' }
      )
    ).toBe(false)
    expect(
      resolveEscPosCutOverride({ escPosCutAfterKitchenHtml: false }, { printRole: 'kitchen' })
    ).toBe(false)
  })
})
