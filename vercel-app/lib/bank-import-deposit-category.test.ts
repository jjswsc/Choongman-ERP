import { describe, expect, it } from 'vitest'
import {
  isChannelRevenueAccountCode,
  isNonRetryableBankBusinessErrorMessage,
  isPosRevenueDepositCategory,
} from '@/lib/bank-import-deposit-category'

describe('bank-import-deposit-category', () => {
  it('detects POS revenue deposit categories', () => {
    expect(isPosRevenueDepositCategory('revenue_delivery')).toBe(true)
    expect(isPosRevenueDepositCategory('receivable_receive')).toBe(false)
  })

  it('allows channel GL codes used in statement import', () => {
    expect(isChannelRevenueAccountCode('4111')).toBe(true)
    expect(isChannelRevenueAccountCode('4120')).toBe(true)
    expect(isChannelRevenueAccountCode('4110')).toBe(false)
  })

  it('flags non-retryable bank guard messages', () => {
    expect(
      isNonRetryableBankBusinessErrorMessage(
        '매장「CM Union Mall」… revenue_delivery … 이중 인식 위험'
      )
    ).toBe(true)
    expect(isNonRetryableBankBusinessErrorMessage('계좌를 선택하세요.')).toBe(false)
  })
})
