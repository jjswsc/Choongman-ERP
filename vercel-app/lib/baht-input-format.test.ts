import { describe, expect, it } from 'vitest'
import {
  formatBahtInputDisplay,
  formatIntegerInputDisplay,
  normalizeDigitChars,
  parseBahtAmount,
  parseIntegerInput,
} from '@/lib/baht-input-format'

describe('normalizeDigitChars', () => {
  it('converts Thai and fullwidth digits to ASCII', () => {
    expect(normalizeDigitChars('๒๓')).toBe('23')
    expect(normalizeDigitChars('１２３')).toBe('123')
  })
})

describe('formatBahtInputDisplay', () => {
  it('accepts Thai digits while typing', () => {
    expect(formatBahtInputDisplay('๒')).toBe('2')
    expect(formatBahtInputDisplay('๒๓')).toBe('23')
    expect(formatBahtInputDisplay('๑,๒๓๔')).toBe('1,234')
  })
})

describe('formatIntegerInputDisplay', () => {
  it('accepts Thai digits for percent discount', () => {
    expect(formatIntegerInputDisplay('๑๕', 3)).toBe('15')
  })
})

describe('parseBahtAmount', () => {
  it('parses Thai digit strings', () => {
    expect(parseBahtAmount('๒๓.๕')).toBe(23.5)
  })
})

describe('parseIntegerInput', () => {
  it('parses Thai digit strings', () => {
    expect(parseIntegerInput('๒๓', 0)).toBe(23)
  })
})
