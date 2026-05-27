import { describe, expect, it } from 'vitest'
import {
  coercePosStoreImportDepositCategory,
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

  it('coerces POS store import revenue_* to receivable_receive', () => {
    expect(
      coercePosStoreImportDepositCategory({
        category: 'revenue_card',
        accountStore: 'CM Union Mall',
      })
    ).toEqual({ category: 'receivable_receive', storeName: 'CM Union Mall' })
    expect(
      coercePosStoreImportDepositCategory({
        category: 'revenue_card',
        accountStore: 'CM Union Mall',
        accountSubjectId: 9,
        revenueSubjects: [{ id: 9, code: '4120' }],
      })
    ).toEqual({ category: 'revenue_card' })
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
