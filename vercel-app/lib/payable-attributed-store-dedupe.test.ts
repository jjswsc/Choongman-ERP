import { describe, expect, it } from 'vitest'
import {
  dedupePayablePaymentLedgerRows,
  isPurchasePayableLedgerRowWithBankCategory,
} from './payable-attributed-store'

describe('dedupePayablePaymentLedgerRows', () => {
  it('keeps accrual-linked payment over legacy bank-only duplicate', () => {
    const rows = dedupePayablePaymentLedgerRows([
      { id: 1, ref_type: 'Inbound', ref_id: 10, amount: 50000, vendor_code: 'V1' },
      { id: 2, ref_type: 'Payment', bank_transaction_id: 99, amount: -18375, vendor_code: '1021' },
      {
        id: 3,
        ref_type: 'Payment',
        bank_transaction_id: 99,
        expense_accrual_id: 38,
        amount: -18375,
        vendor_code: '1021',
      },
    ])
    const payments = rows.filter((r) => r.ref_type === 'Payment')
    expect(payments).toHaveLength(1)
    expect(payments[0].id).toBe(3)
    expect(rows).toHaveLength(2)
  })

  it('leaves payments without bank_transaction_id untouched', () => {
    const rows = dedupePayablePaymentLedgerRows([
      { id: 1, ref_type: 'Payment', amount: -100, vendor_code: 'V1' },
      { id: 2, ref_type: 'Payment', amount: -200, vendor_code: 'V1' },
    ])
    expect(rows).toHaveLength(2)
  })
})

describe('isPurchasePayableLedgerRowWithBankCategory', () => {
  it('excludes general expense bank payment from purchase payable ledger', () => {
    const bankCategoryById = new Map<number, string>([[55, 'expense']])
    expect(
      isPurchasePayableLedgerRowWithBankCategory(
        {
          id: 1,
          ref_type: 'Payment',
          amount: -32267.5,
          vendor_code: '1015',
          bank_transaction_id: 55,
        },
        { purchaseAccrualIds: new Set(), bankCategoryById }
      )
    ).toBe(false)
  })

  it('keeps purchase_payment bank withdrawal in ledger', () => {
    const bankCategoryById = new Map<number, string>([[56, 'purchase_payment']])
    expect(
      isPurchasePayableLedgerRowWithBankCategory(
        {
          id: 2,
          ref_type: 'Payment',
          amount: -32367.5,
          vendor_code: '1015',
          bank_transaction_id: 56,
        },
        { purchaseAccrualIds: new Set(), bankCategoryById }
      )
    ).toBe(true)
  })
})
