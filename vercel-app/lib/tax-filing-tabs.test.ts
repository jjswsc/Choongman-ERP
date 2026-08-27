import { describe, expect, it } from 'vitest'
import { resolveTaxFilingTab, TAX_FILING_DEFAULT_TAB } from './tax-filing-tabs'

describe('resolveTaxFilingTab', () => {
  it('keeps canonical tabs', () => {
    expect(resolveTaxFilingTab('purchaseTaxInv')).toBe('purchaseTaxInv')
    expect(resolveTaxFilingTab('pp30')).toBe(TAX_FILING_DEFAULT_TAB)
    expect(resolveTaxFilingTab('sso')).toBe('sso')
  })

  it('maps legacy query values', () => {
    expect(resolveTaxFilingTab('vat')).toBe('pp30')
    expect(resolveTaxFilingTab('pp30pp36')).toBe('pp30')
    expect(resolveTaxFilingTab('wht')).toBe('pnd1')
    expect(resolveTaxFilingTab('cit')).toBe('pnd5051')
    expect(resolveTaxFilingTab('dbd')).toBe('pnd53')
  })

  it('returns null for empty or unknown', () => {
    expect(resolveTaxFilingTab('')).toBeNull()
    expect(resolveTaxFilingTab(null)).toBeNull()
    expect(resolveTaxFilingTab('not-a-tab')).toBeNull()
  })
})
