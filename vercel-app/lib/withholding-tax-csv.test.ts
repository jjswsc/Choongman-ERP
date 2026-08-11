import { describe, expect, it } from 'vitest'
import {
  classifyWhtLedgerFormFamily,
  effectivePnd353FormHint,
  matchesPnd1FilingForm,
  normalizePndFormHint,
  resolveWhtSummaryFormKey,
  whtLedgerRowMatchesFocusMode,
} from '@/lib/withholding-tax-csv'

describe('classifyWhtLedgerFormFamily', () => {
  it('distinguishes PND1 / PND1A / PND3 / PND53', () => {
    expect(classifyWhtLedgerFormFamily('PND1')).toBe('PND1')
    expect(classifyWhtLedgerFormFamily('ภ.ง.ด.1')).toBe('PND1')
    expect(classifyWhtLedgerFormFamily('PND1A')).toBe('PND1A')
    expect(classifyWhtLedgerFormFamily('ภ.ง.ด.1ก')).toBe('PND1A')
    expect(classifyWhtLedgerFormFamily('PND3')).toBe('PND3')
    expect(classifyWhtLedgerFormFamily('ภ.ง.ด.3')).toBe('PND3')
    expect(classifyWhtLedgerFormFamily('PND53')).toBe('PND53')
    expect(classifyWhtLedgerFormFamily('ภ.ง.ด.53')).toBe('PND53')
  })

  it('does not treat PND1 as PND3/53', () => {
    expect(classifyWhtLedgerFormFamily('PND1')).not.toBe('PND3')
    expect(classifyWhtLedgerFormFamily('PND1')).not.toBe('PND53')
  })

  it('does not treat PND91 / PND50 / PND51 as PND1', () => {
    expect(classifyWhtLedgerFormFamily('PND91')).toBe('OTHER')
    expect(classifyWhtLedgerFormFamily('ภ.ง.ด.91')).toBe('OTHER')
    expect(classifyWhtLedgerFormFamily('PND50')).toBe('OTHER')
    expect(classifyWhtLedgerFormFamily('PND51')).toBe('OTHER')
    expect(classifyWhtLedgerFormFamily('PND1')).toBe('PND1')
    expect(classifyWhtLedgerFormFamily('P.N.D.1')).toBe('PND1')
  })
})

describe('normalizePndFormHint', () => {
  it('no longer defaults unknown/PND1 to PND53', () => {
    expect(normalizePndFormHint('PND1')).toBe('ALL')
    expect(normalizePndFormHint('')).toBe('ALL')
    expect(normalizePndFormHint('PND3')).toBe('PND3')
    expect(normalizePndFormHint('PND53')).toBe('PND53')
  })
})

describe('matchesPnd1FilingForm', () => {
  it('all means only PND1 family — excludes PND3/53', () => {
    expect(matchesPnd1FilingForm('PND1', 'all')).toBe(true)
    expect(matchesPnd1FilingForm('PND1A', 'all')).toBe(true)
    expect(matchesPnd1FilingForm('PND3', 'all')).toBe(false)
    expect(matchesPnd1FilingForm('PND53', 'all')).toBe(false)
    expect(matchesPnd1FilingForm('', 'all')).toBe(false)
  })
})

describe('resolveWhtSummaryFormKey', () => {
  it('classifies empty hint via payee instead of defaulting to PND53', () => {
    expect(
      resolveWhtSummaryFormKey({
        form_hint: '',
        payee_name: 'นายสมชาย ใจดี',
        payee_tax_id: '3101800833583',
      })
    ).toBe('PND3')
    expect(
      resolveWhtSummaryFormKey({
        form_hint: '',
        payee_name: 'Polonext Co., Ltd.',
        payee_tax_id: '0105561000000',
      })
    ).toBe('PND53')
    expect(resolveWhtSummaryFormKey({ form_hint: 'PND1', payee_name: 'พนักงาน' })).toBe('PND1')
  })
})

describe('whtLedgerRowMatchesFocusMode', () => {
  it('filters ledger rows per tax-filing tab', () => {
    const pnd1 = { form_hint: 'PND1', payee_name: 'นายสมชาย' }
    const pnd3 = { form_hint: 'PND3', payee_name: 'นายสมชาย', payee_tax_id: '3101800833583' }
    const pnd53 = {
      form_hint: 'PND53',
      payee_name: 'Polonext Co., Ltd.',
      payee_tax_id: '0105561000000',
    }

    expect(whtLedgerRowMatchesFocusMode(pnd1, 'pnd1')).toBe(true)
    expect(whtLedgerRowMatchesFocusMode(pnd3, 'pnd1')).toBe(false)
    expect(whtLedgerRowMatchesFocusMode(pnd53, 'pnd1')).toBe(false)

    expect(whtLedgerRowMatchesFocusMode(pnd1, 'pnd3')).toBe(false)
    expect(whtLedgerRowMatchesFocusMode(pnd3, 'pnd3')).toBe(true)
    expect(whtLedgerRowMatchesFocusMode(pnd53, 'pnd3')).toBe(false)

    expect(whtLedgerRowMatchesFocusMode(pnd1, 'pnd53')).toBe(false)
    expect(whtLedgerRowMatchesFocusMode(pnd3, 'pnd53')).toBe(false)
    expect(whtLedgerRowMatchesFocusMode(pnd53, 'pnd53')).toBe(true)

    expect(whtLedgerRowMatchesFocusMode(pnd1, 'pnd91')).toBe(false)
  })

  it('resolves empty form_hint via payee for PND3/53 tabs only', () => {
    const natural = { form_hint: '', payee_name: 'นายสมชาย ใจดี', payee_tax_id: '3101800833583' }
    const company = {
      form_hint: '',
      payee_name: 'Polonext Co., Ltd.',
      payee_tax_id: '0105561000000',
    }
    expect(whtLedgerRowMatchesFocusMode(natural, 'pnd3')).toBe(true)
    expect(whtLedgerRowMatchesFocusMode(natural, 'pnd53')).toBe(false)
    expect(whtLedgerRowMatchesFocusMode(company, 'pnd53')).toBe(true)
    expect(whtLedgerRowMatchesFocusMode(company, 'pnd3')).toBe(false)
    // PND1 requires explicit hint
    expect(whtLedgerRowMatchesFocusMode(natural, 'pnd1')).toBe(false)
  })
})

describe('effectivePnd353FormHint', () => {
  it('excludes PND1 from PND3/53 exports', () => {
    expect(effectivePnd353FormHint({ form_hint: 'PND1', payee_name: 'พนักงาน' })).toBeNull()
    expect(effectivePnd353FormHint({ form_hint: 'PND3', payee_name: 'นายสมชาย' })).toBe('PND3')
    expect(effectivePnd353FormHint({ form_hint: 'PND53', payee_name: 'Co., Ltd.' })).toBe('PND53')
  })
})
