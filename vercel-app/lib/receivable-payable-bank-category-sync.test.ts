import { describe, expect, it } from 'vitest'
import { resolvePayableSyncAfterBankCategoryChange } from './receivable-payable'

describe('resolvePayableSyncAfterBankCategoryChange', () => {
  it('creates a payable payment when classifying as purchase_payment with a vendor', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'expense',
        nextCategory: 'purchase_payment',
        hasLinkedPayment: false,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: false, syncExistingPayment: false, createStandalonePayment: true })
  })

  it('removes standalone payable only when leaving purchase_payment', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'purchase_payment',
        nextCategory: 'expense',
        hasLinkedPayment: false,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: true, syncExistingPayment: false, createStandalonePayment: false })

    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'purchase_payment',
        nextCategory: 'purchase_payment',
        hasLinkedPayment: false,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: false, syncExistingPayment: false, createStandalonePayment: true })
  })

  it('syncs existing expense-linked payment when vendor present', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'purchase_payment',
        nextCategory: 'purchase_payment',
        hasLinkedPayment: true,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: false, syncExistingPayment: true, createStandalonePayment: false })
  })

  it('skips sync without vendor', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'expense',
        nextCategory: 'purchase_payment',
        hasLinkedPayment: true,
        vendorCode: '',
      })
    ).toEqual({ deleteStandalonePayment: false, syncExistingPayment: false, createStandalonePayment: false })
  })

  it('does not delete standalone when unrelated category change without purchase_payment', () => {
    expect(
      resolvePayableSyncAfterBankCategoryChange({
        prevCategory: 'transfer',
        nextCategory: 'expense',
        hasLinkedPayment: true,
        vendorCode: '1020',
      })
    ).toEqual({ deleteStandalonePayment: false, syncExistingPayment: true, createStandalonePayment: false })
  })
})
