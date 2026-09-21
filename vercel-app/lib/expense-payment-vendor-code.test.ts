import { describe, expect, it } from 'vitest'
import {
  isPlaceholderPayeeCode,
  pickExpensePaymentVendorCode,
} from '@/lib/expense-payment-vendor-code'

describe('pickExpensePaymentVendorCode', () => {
  it('keeps a real vendor code', () => {
    expect(
      pickExpensePaymentVendorCode({
        payeeCode: 'V001',
        withdrawalCategory: 'expense',
      })
    ).toBe('V001')
  })

  it('keeps tax auto payee without vendor master', () => {
    expect(
      pickExpensePaymentVendorCode({
        payeeCode: 'auto_tax_vat',
        withdrawalCategory: 'tax_vat',
      })
    ).toBe('auto_tax_vat')
    expect(
      pickExpensePaymentVendorCode({
        payeeCode: '',
        withdrawalCategory: 'tax_withholding',
      })
    ).toBe('tax_tax_withholding')
  })

  it('allows auto_fixed_asset when vendor master has no match', () => {
    expect(
      pickExpensePaymentVendorCode({
        payeeCode: 'auto_fixed_asset',
        withdrawalCategory: 'fixed_asset',
      })
    ).toBe('auto_fixed_asset')
  })

  it('prefers vendor master when a placeholder fixed-asset payee later matches', () => {
    expect(
      pickExpensePaymentVendorCode({
        payeeCode: 'auto_fixed_asset',
        withdrawalCategory: 'fixed_asset',
        resolvedFromMaster: 'SHOP01',
      })
    ).toBe('SHOP01')
  })

  it('still requires a vendor for regular expense placeholders', () => {
    expect(
      pickExpensePaymentVendorCode({
        payeeCode: 'auto_expense',
        withdrawalCategory: 'expense',
      })
    ).toBe('')
    expect(isPlaceholderPayeeCode('auto_fixed_asset')).toBe(true)
    expect(isPlaceholderPayeeCode('card_12')).toBe(true)
    expect(isPlaceholderPayeeCode('V001')).toBe(false)
  })
})
