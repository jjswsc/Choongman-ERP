import { describe, expect, it } from 'vitest'
import {
  categoryUsesAccountSubjectPicker,
  mapCategoryToMainSub,
  pickOfficeStore,
  resolveStoreInList,
  resolveWithdrawalCategory,
} from './withdrawal-management-tab-utils'

describe('categoryUsesAccountSubjectPicker', () => {
  it('keeps account subject for purchase, expense, fixed asset, and general transfer', () => {
    expect(categoryUsesAccountSubjectPicker('purchase')).toBe(true)
    expect(categoryUsesAccountSubjectPicker('expense')).toBe(true)
    expect(categoryUsesAccountSubjectPicker('fixed_asset')).toBe(true)
    expect(categoryUsesAccountSubjectPicker('transfer', 'bank_general')).toBe(true)
  })

  it('clears account subject for other transfer kinds', () => {
    expect(categoryUsesAccountSubjectPicker('transfer', 'bank_to_petty')).toBe(false)
    expect(categoryUsesAccountSubjectPicker('transfer', 'bank_to_card')).toBe(false)
    expect(categoryUsesAccountSubjectPicker('tax')).toBe(false)
  })
})

describe('mapCategoryToMainSub', () => {
  it('maps stored withdrawal categories to main/sub selections', () => {
    expect(mapCategoryToMainSub('purchase_payment')).toEqual({ main: 'purchase', sub: 'normal' })
    expect(mapCategoryToMainSub('purchase_advance')).toEqual({ main: 'purchase', sub: 'advance' })
    expect(mapCategoryToMainSub('expense_advance')).toEqual({ main: 'expense', sub: 'advance' })
    expect(mapCategoryToMainSub('fixed_asset')).toEqual({ main: 'fixed_asset', sub: '' })
    expect(mapCategoryToMainSub('loan_given')).toEqual({ main: 'loan', sub: 'given' })
    expect(mapCategoryToMainSub('tax_sso')).toEqual({ main: 'tax', sub: 'sso' })
    expect(mapCategoryToMainSub('dividend')).toEqual({ main: 'dividend', sub: '' })
  })

  it('treats every transfer variant as transfer', () => {
    expect(mapCategoryToMainSub('bank_card_bill')).toEqual({ main: 'transfer', sub: '' })
    expect(mapCategoryToMainSub('transfer_to_petty')).toEqual({ main: 'transfer', sub: '' })
    expect(mapCategoryToMainSub('transfer_other')).toEqual({ main: 'transfer', sub: '' })
  })

  it('normalizes case/whitespace and falls back to normal expense', () => {
    expect(mapCategoryToMainSub('  TAX ')).toEqual({ main: 'tax', sub: 'withholding' })
    expect(mapCategoryToMainSub('')).toEqual({ main: 'expense', sub: 'normal' })
    expect(mapCategoryToMainSub('unknown')).toEqual({ main: 'expense', sub: 'normal' })
  })
})

describe('resolveWithdrawalCategory', () => {
  it('builds the stored category from main/sub', () => {
    expect(resolveWithdrawalCategory('purchase', 'normal')).toBe('purchase_payment')
    expect(resolveWithdrawalCategory('purchase', 'advance')).toBe('purchase_advance')
    expect(resolveWithdrawalCategory('expense', 'advance')).toBe('expense_advance')
    expect(resolveWithdrawalCategory('loan', 'given')).toBe('loan_given')
    expect(resolveWithdrawalCategory('loan', 'repayment')).toBe('loan_repayment')
    expect(resolveWithdrawalCategory('tax', 'vat')).toBe('tax_vat')
    expect(resolveWithdrawalCategory('tax', '')).toBe('tax_withholding')
    expect(resolveWithdrawalCategory('transfer', '')).toBe('transfer')
    expect(resolveWithdrawalCategory('', '')).toBe('expense')
  })

  it('round-trips with mapCategoryToMainSub', () => {
    for (const cat of ['purchase_payment', 'purchase_advance', 'expense', 'expense_advance', 'fixed_asset', 'loan_given', 'loan_repayment', 'tax_vat', 'tax_withholding', 'tax_corporate', 'tax_sso', 'correction', 'dividend']) {
      const { main, sub } = mapCategoryToMainSub(cat)
      expect(resolveWithdrawalCategory(main, sub)).toBe(cat)
    }
  })
})

describe('pickOfficeStore', () => {
  it('prefers the canonical office, then any office variant, then the first store', () => {
    expect(pickOfficeStore([])).toBe('')
    expect(pickOfficeStore(['Silom', 'CM Office'])).toBe('CM Office')
    expect(pickOfficeStore(['Silom', '본사'])).toBe('CM Office')
    expect(pickOfficeStore(['Silom', 'Asoke'])).toBe('Silom')
  })
})

describe('resolveStoreInList', () => {
  it('returns exact matches, falls back to the raw name, and blanks empty input', () => {
    expect(resolveStoreInList('Silom', ['Asoke', 'Silom'])).toBe('Silom')
    expect(resolveStoreInList('  ', ['Silom'])).toBe('')
    expect(resolveStoreInList('Nowhere', ['Silom'])).toBe('Nowhere')
  })
})
