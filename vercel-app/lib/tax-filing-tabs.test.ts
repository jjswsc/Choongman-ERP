import { describe, expect, it } from 'vitest'
import {
  planTaxFilingTabSync,
  resolveTaxFilingTab,
  TAX_FILING_DEFAULT_TAB,
} from './tax-filing-tabs'

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

describe('planTaxFilingTabSync', () => {
  it('does not re-apply a canonical URL tab (avoids snapping back to PND.3)', () => {
    expect(
      planTaxFilingTabSync({
        urlTabRaw: 'pnd3',
        savedTab: 'pnd1',
        sessionAlreadyRestored: false,
      })
    ).toEqual({ persist: 'pnd3', markRestored: true })
  })

  it('canonicalizes legacy URL aliases', () => {
    expect(
      planTaxFilingTabSync({
        urlTabRaw: 'wht',
        savedTab: null,
        sessionAlreadyRestored: false,
      })
    ).toEqual({ persist: 'pnd1', apply: 'pnd1', markRestored: true })
  })

  it('restores a non-default session tab once when URL has no tab', () => {
    expect(
      planTaxFilingTabSync({
        urlTabRaw: '',
        savedTab: 'pnd3',
        sessionAlreadyRestored: false,
      })
    ).toEqual({ apply: 'pnd3', markRestored: true })
  })

  it('does not restore session again after leaving PND.3 for the default tab', () => {
    expect(
      planTaxFilingTabSync({
        urlTabRaw: '',
        savedTab: 'pnd3',
        sessionAlreadyRestored: true,
      })
    ).toEqual({})
  })
})
