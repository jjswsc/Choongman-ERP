import { describe, expect, it } from 'vitest'
import {
  bankWithdrawOpensCardBillRegister,
  canQueueWithdrawCategoryForCardBill,
  memoLooksLikeCardBill,
  memoLooksLikeCardMerchantFee,
} from '@/lib/card-bill-memo'
import { suggestWithdrawFromMemo } from '@/lib/suggest-withdraw-from-memo'

describe('memoLooksLikeCardBill', () => {
  it('matches typical Thai bank card-bill memos', () => {
    expect(memoLooksLikeCardBill('KBank Credit Card')).toBe(true)
    expect(memoLooksLikeCardBill('CREDIT CARD PAYMENT')).toBe(true)
    expect(memoLooksLikeCardBill('K-CREDIT 08/2026')).toBe(true)
    expect(memoLooksLikeCardBill('ชำระบัตรเครดิต')).toBe(true)
    expect(memoLooksLikeCardBill('카드대금 8월')).toBe(true)
  })

  it('does not treat merchant card fees as a monthly bill', () => {
    expect(memoLooksLikeCardMerchantFee('credit card fee')).toBe(true)
    expect(memoLooksLikeCardBill('credit card fee')).toBe(false)
    expect(memoLooksLikeCardBill('카드수수료 Visa')).toBe(false)
  })

  it('does not match generic bank names or POS card sales', () => {
    expect(memoLooksLikeCardBill('SCB transfer to HQ')).toBe(false)
    expect(memoLooksLikeCardBill('KBank payroll')).toBe(false)
    expect(memoLooksLikeCardBill('Visa POS settlement')).toBe(false)
  })
})

describe('canQueueWithdrawCategoryForCardBill', () => {
  it('allows transfer and unclassified', () => {
    expect(canQueueWithdrawCategoryForCardBill('transfer', 'anything')).toBe(true)
    expect(canQueueWithdrawCategoryForCardBill('unclassified', 'KBank Credit Card')).toBe(true)
  })

  it('blocks purchase and tax even if memo looks like a card bill', () => {
    expect(canQueueWithdrawCategoryForCardBill('purchase_payment', 'CREDIT CARD')).toBe(false)
    expect(canQueueWithdrawCategoryForCardBill('tax_vat', 'CREDIT CARD')).toBe(false)
  })

  it('allows expense only when the memo looks like a card bill', () => {
    expect(canQueueWithdrawCategoryForCardBill('expense', 'office rent')).toBe(false)
    expect(canQueueWithdrawCategoryForCardBill('expense', 'CREDIT CARD PAYMENT')).toBe(true)
  })
})

describe('bankWithdrawOpensCardBillRegister', () => {
  it('opens the card-bill path for transfer or card-like unclassified', () => {
    expect(bankWithdrawOpensCardBillRegister('transfer', 'internal')).toBe(true)
    expect(bankWithdrawOpensCardBillRegister('unclassified', 'CREDIT CARD')).toBe(true)
    expect(bankWithdrawOpensCardBillRegister('unclassified', 'office rent')).toBe(false)
  })
})

describe('suggestWithdrawFromMemo card bill', () => {
  it('classifies monthly card bills as transfer, not expense', () => {
    expect(suggestWithdrawFromMemo('KBank Credit Card', []).category).toBe('transfer')
    expect(suggestWithdrawFromMemo('CREDIT CARD PAYMENT', []).accountSubjectId).toBeUndefined()
  })

  it('keeps merchant card fees as expense', () => {
    expect(suggestWithdrawFromMemo('credit card fee', [{ id: 129, code: '5529' }])).toEqual({
      category: 'expense',
      accountSubjectId: 129,
    })
  })
})
