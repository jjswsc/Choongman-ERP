import { describe, expect, it } from 'vitest'
import { resolvePayableSyncAfterBankCategoryChange } from './receivable-payable'

describe('resolvePayableSyncAfterBankCategoryChange', () => {
  it('does not create payable when classifying as purchase_payment alone', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'expense',
        nextCategory: 'purchase_payment',
        hasLinkedPayment: false,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: true, syncExistingPayment: false })
  })

  it('removes standalone payable when leaving or staying on purchase_payment', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'purchase_payment',
        nextCategory: 'expense',
        hasLinkedPayment: false,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: true, syncExistingPayment: false })

    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'purchase_payment',
        nextCategory: 'purchase_payment',
        hasLinkedPayment: false,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: true, syncExistingPayment: false })
  })

  it('syncs existing expense-linked payment when vendor present', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'purchase_payment',
        nextCategory: 'purchase_payment',
        hasLinkedPayment: true,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: true, syncExistingPayment: true })
  })

  it('skips sync without vendor', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'expense',
        nextCategory: 'purchase_payment',
        hasLinkedPayment: true,
        vendorCode: '',
      })
    ).toEqual({ deleteStandalonePayment: true, syncExistingPayment: false })
  })

  it('does not delete standalone when unrelated category change without purchase_payment', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'transfer',
        nextCategory: 'expense',
        hasLinkedPayment: true,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: false, syncExistingPayment: true })
  })
})
