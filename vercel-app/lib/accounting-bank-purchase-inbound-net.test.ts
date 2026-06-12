import { describe, expect, it } from 'vitest'
import {
  netBankPurchasePaymentForIncomeStatement,
  sumInboundLinkAmountsByBankTransactionId,
} from './accounting-bank-purchase-inbound-net'

describe('netBankPurchasePaymentForIncomeStatement', () => {
  it('returns full amount when no inbound link', () => {
    expect(netBankPurchasePaymentForIncomeStatement(10_000, 0)).toBe(10_000)
  })

  it('returns zero when fully linked to inbound', () => {
    expect(netBankPurchasePaymentForIncomeStatement(10_000, 10_000)).toBe(0)
  })

  it('returns remainder for partial inbound link', () => {
    expect(netBankPurchasePaymentForIncomeStatement(10_000, 6_000)).toBe(4_000)
  })

  it('never returns negative when link exceeds payment', () => {
    expect(netBankPurchasePaymentForIncomeStatement(5_000, 8_000)).toBe(0)
  })
})

describe('sumInboundLinkAmountsByBankTransactionId', () => {
  it('sums multiple links per bank transaction', () => {
    const map = sumInboundLinkAmountsByBankTransactionId([
      { bank_transaction_id: 1, amount: 3000 },
      { bank_transaction_id: 1, amount: 2000 },
      { bank_transaction_id: 2, amount: 1000 },
    ])
    expect(map.get(1)).toBe(5000)
    expect(map.get(2)).toBe(1000)
  })
})
