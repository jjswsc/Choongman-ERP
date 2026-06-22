import { describe, expect, it } from 'vitest'
import {
  formatTierRatePercentInput,
  parseTierRatePercentInput,
  tierRateDecimalToPercent,
  tierRatePercentToDecimal,
} from '@/lib/member-tier-rate-percent'

describe('member-tier-rate-percent', () => {
  it('converts between decimal storage and percent UI', () => {
    expect(tierRateDecimalToPercent(0.01)).toBe(1)
    expect(tierRateDecimalToPercent(0.05)).toBe(5)
    expect(tierRatePercentToDecimal(5)).toBe(0.05)
    expect(tierRatePercentToDecimal(1)).toBe(0.01)
    expect(tierRatePercentToDecimal(0)).toBe(0)
  })

  it('formats and parses admin input', () => {
    expect(formatTierRatePercentInput(0.05)).toBe('5')
    expect(formatTierRatePercentInput(0)).toBe('0')
    expect(parseTierRatePercentInput('5')).toBe(0.05)
    expect(parseTierRatePercentInput('')).toBe(0)
    expect(parseTierRatePercentInput('1.5')).toBe(0.015)
  })
})
