import { describe, expect, it } from 'vitest'
import { formatBahtInteger, formatMoney2, roundFinancialAmount } from './financial-amount-format'

describe('financial amount satang', () => {
  it('keeps 0.01 and rounds half-up to 2 decimals', () => {
    expect(roundFinancialAmount(176211.957)).toBe(176211.96)
    expect(roundFinancialAmount(0.004)).toBe(0)
    expect(roundFinancialAmount(0.005)).toBe(0.01)
  })

  it('formats baht and plain money with two fraction digits', () => {
    expect(formatMoney2(176211.957)).toBe('176,211.96')
    expect(formatBahtInteger(176211.957)).toBe('฿176,211.96')
    expect(formatBahtInteger(0)).toBe('฿0.00')
  })
})
