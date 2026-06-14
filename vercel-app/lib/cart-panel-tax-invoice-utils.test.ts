import { describe, expect, it } from 'vitest'
import {
  buildCartPanelOrderMemoWithTaxInvoice,
  isSyntheticTaxRegistryKey,
  normalizeTaxInvoiceFields,
  taxRegistryLocalKey,
  validateTaxInvoiceFields,
} from '@/lib/cart-panel-tax-invoice-utils'

describe('cart-panel-tax-invoice-utils', () => {
  it('taxRegistryLocalKey prefers member number', () => {
    expect(taxRegistryLocalKey('M001', undefined, '1234567890123', '00001')).toBe('M001')
    expect(taxRegistryLocalKey('', undefined, '1234567890123', '00001')).toBe('1234567890123_00001')
  })

  it('isSyntheticTaxRegistryKey detects taxId_branch pattern', () => {
    expect(isSyntheticTaxRegistryKey('1234567890123_00001')).toBe(true)
    expect(isSyntheticTaxRegistryKey('M001')).toBe(false)
  })

  it('validateTaxInvoiceFields when disabled returns no errors', () => {
    const normalized = normalizeTaxInvoiceFields({
      taxName: '',
      taxId: '',
      taxBranchNo: '',
      taxPhone: '',
      taxEmail: '',
      taxAddress: '',
      invoiceCustomerType: 'person',
    })
    expect(validateTaxInvoiceFields({ needTaxInvoice: false, normalized, invoiceCustomerType: 'person' }).invalid).toBe(
      false
    )
  })

  it('validateTaxInvoiceFields requires company branch', () => {
    const normalized = normalizeTaxInvoiceFields({
      taxName: 'Test Co',
      taxId: '1234567890123',
      taxBranchNo: '',
      taxPhone: '0812345678',
      taxEmail: 'a@b.co',
      taxAddress: 'Bangkok',
      invoiceCustomerType: 'company',
    })
    const { invalid, errors } = validateTaxInvoiceFields({
      needTaxInvoice: true,
      normalized,
      invoiceCustomerType: 'company',
    })
    expect(invalid).toBe(true)
    expect(errors).toContain('branch')
  })

  it('buildCartPanelOrderMemoWithTaxInvoice skips when not needed', () => {
    const normalized = normalizeTaxInvoiceFields({
      taxName: 'A',
      taxId: '1234567890123',
      taxBranchNo: '00000',
      taxPhone: '0812345678',
      taxEmail: '',
      taxAddress: 'Addr',
      invoiceCustomerType: 'person',
    })
    expect(
      buildCartPanelOrderMemoWithTaxInvoice({
        baseMemo: 'note',
        includeTaxInvoice: false,
        taxMemberNo: '',
        invoiceCustomerType: 'person',
        normalized,
        isMemberOrder: false,
      })
    ).toBe('note')
  })
})
