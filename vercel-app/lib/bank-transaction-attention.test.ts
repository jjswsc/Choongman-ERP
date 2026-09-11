import { describe, expect, it } from 'vitest'
import { bankRowNeedsAttention, bankRowShowsVatNotRegistered } from '@/lib/bank-transaction-attention'

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

  it('does not flag tax remittance as missing purchase VAT invoice', () => {
    expect(
      bankRowShowsVatNotRegistered({
        transType: 'withdraw',
        category: 'tax',
        isLinked: false,
        invoiceReceived: false,
      })
    ).toBe(false)
  })

  it('does not flag card-linked expense as missing VAT on the bank row', () => {
    expect(
      bankRowShowsVatNotRegistered({
        transType: 'withdraw',
        category: 'expense',
        isCardLinked: true,
        isLinked: false,
        invoiceReceived: false,
      })
    ).toBe(false)
  })
})

describe('bank-transaction-attention card-linked expense', () => {
  it('treats card-linked expense as complete without an account subject', () => {
    expect(
      bankRowNeedsAttention({
        transType: 'withdraw',
        category: 'expense',
        isCardLinked: true,
        isLinked: false,
        accountSubjectId: null,
      })
    ).toEqual({ needsAttention: false, reason: null })
  })

  it('still flags unlinked expense as expense-link pending', () => {
    expect(
      bankRowNeedsAttention({
        transType: 'withdraw',
        category: 'expense',
        isCardLinked: false,
        isLinked: false,
        accountSubjectId: null,
      }).reason
    ).toBe('expense_link_pending')
  })
})
