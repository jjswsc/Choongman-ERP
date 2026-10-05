import { describe, expect, it } from 'vitest'
import {
  parsePosReceiptAmountQuery,
  posReceiptOrderMatchesAmountQuery,
} from './pos-receipt-list-search'

describe('parsePosReceiptAmountQuery', () => {
  it('parses plain, comma, and baht text', () => {
    expect(parsePosReceiptAmountQuery('350')).toBe(350)
    expect(parsePosReceiptAmountQuery('1,234.50')).toBe(1234.5)
    expect(parsePosReceiptAmountQuery('฿199')).toBe(199)
    expect(parsePosReceiptAmountQuery('199 บาท')).toBe(199)
    expect(parsePosReceiptAmountQuery(' 40.5 ')).toBe(40.5)
  })

  it('rejects text and extra decimals', () => {
    expect(parsePosReceiptAmountQuery('')).toBeNull()
    expect(parsePosReceiptAmountQuery('A12')).toBeNull()
    expect(parsePosReceiptAmountQuery('12.345')).toBeNull()
    expect(parsePosReceiptAmountQuery('โต๊ะ 5')).toBeNull()
  })
})

describe('posReceiptOrderMatchesAmountQuery', () => {
  it('matches the list total', () => {
    expect(posReceiptOrderMatchesAmountQuery({ total: 350 }, '350.00')).toBe(true)
    expect(posReceiptOrderMatchesAmountQuery({ total: 350 }, '351')).toBe(false)
  })

  it('matches the coupon-adjusted total shown in the list', () => {
    const order = { total: 400, discountAmt: 0, couponDiscountAmt: 50 }
    expect(posReceiptOrderMatchesAmountQuery(order, '350')).toBe(true)
    expect(posReceiptOrderMatchesAmountQuery(order, '400')).toBe(true)
  })

  it('matches a payment slice when the bill total differs', () => {
    const order = { total: 500, paymentCard: 120.5, paymentCash: 379.5 }
    expect(posReceiptOrderMatchesAmountQuery(order, '120.50')).toBe(true)
    expect(posReceiptOrderMatchesAmountQuery(order, '379.5')).toBe(true)
    expect(posReceiptOrderMatchesAmountQuery(order, '200')).toBe(false)
  })

  it('does not treat empty payment fields as zero', () => {
    expect(
      posReceiptOrderMatchesAmountQuery(
        { total: 80, paymentCash: 80, paymentCard: 0, paymentQr: 0 },
        '0'
      )
    ).toBe(false)
    expect(posReceiptOrderMatchesAmountQuery({ total: 0, paymentCard: 0 }, '0')).toBe(true)
  })

  it('matches an approved terminal amount that differs from the bill', () => {
    expect(
      posReceiptOrderMatchesAmountQuery(
        { total: 209, paymentCard: 209, linkposApprovedAmount: 199 },
        '199'
      )
    ).toBe(true)
  })
})
