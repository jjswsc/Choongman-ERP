import { describe, expect, it } from 'vitest'
import { bankRowShowsVatNotRegistered } from '@/lib/bank-transaction-attention'

describe('bank-transaction-attention VAT badge', () => {
  it('flags unlinked expense withdraw without invoice', () => {
    expect(
      bankRowShowsVatNotRegistered({
        transType: 'withdraw',
        category: 'expense',
        isLinked: false,
        invoiceReceived: false,
      })
    ).toBe(true)
  })

  it('clears when expense is linked and invoice evidence exists', () => {
    expect(
      bankRowShowsVatNotRegistered({
        transType: 'withdraw',
        category: 'expense',
        isLinked: true,
        invoiceReceived: true,
      })
    ).toBe(false)
    expect(
      bankRowShowsVatNotRegistered({
        transType: 'withdraw',
        category: 'expense',
        isLinked: true,
        invoiceNo: 'INV-001',
      })
    ).toBe(false)
  })

  it('flags purchase_payment without invoice', () => {
    expect(
      bankRowShowsVatNotRegistered({
        transType: 'withdraw',
        category: 'purchase_payment',
        isLinked: true,
        invoiceReceived: false,
      })
    ).toBe(true)
  })

  it('ignores non expense-related withdraw categories', () => {
    expect(
      bankRowShowsVatNotRegistered({
        transType: 'withdraw',
        category: 'transfer',
        isLinked: false,
      })
    ).toBe(false)
  })
})
