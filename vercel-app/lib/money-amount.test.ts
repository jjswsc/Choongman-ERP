import { describe, expect, it } from 'vitest'
import {
  formatMoneyAmountParam,
  formatMoneyBaht,
  moneyEqual,
  moneyInputStringFromAmount,
  normalizeMoneyInputString,
  parseMoneyAmount,
} from '@/lib/money-amount'

describe('money-amount', () => {
  it('normalizes input to 2 decimal places', () => {
    expect(normalizeMoneyInputString('18669.88')).toBe('18669.88')
    expect(normalizeMoneyInputString('18,669.887')).toBe('18669.88')
    expect(normalizeMoneyInputString('abc18669.5xyz')).toBe('18669.5')
  })

  it('parses bank-style decimal amounts', () => {
    expect(parseMoneyAmount('18669.88')).toBe(18669.88)
    expect(parseMoneyAmount(-18669.88)).toBe(18669.88)
    expect(parseMoneyAmount(18669.879999999)).toBe(18669.88)
  })

  it('compares amounts with cent tolerance', () => {
    expect(moneyEqual(18669.88, 18669.88)).toBe(true)
    expect(moneyEqual(18669.879999, 18669.88)).toBe(true)
    expect(moneyEqual(18669.88, 18669.87)).toBe(false)
  })

  it('preserves decimals in URL/form strings', () => {
    expect(moneyInputStringFromAmount('18669.88')).toBe('18669.88')
    expect(formatMoneyAmountParam(18669.88)).toBe('18669.88')
    expect(formatMoneyAmountParam(18669)).toBe('18669.00')
  })

  it('formats display with 2 fraction digits', () => {
    expect(formatMoneyBaht(18669.88)).toMatch(/18,669\.88|18\.669,88/)
    expect(formatMoneyBaht(18669)).toMatch(/18,669\.00|18\.669,00/)
  })
})
