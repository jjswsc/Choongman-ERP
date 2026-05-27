import { describe, expect, it } from 'vitest'
import {
  isNonRetryableBankBusinessErrorMessage,
  isPosRevenueDepositCategory,
  normalizeBulkImportDepositCategory,
} from '@/lib/bank-import-deposit-category'

describe('bank-import-deposit-category', () => {
  it('detects POS revenue deposit categories', () => {
    expect(isPosRevenueDepositCategory('revenue_delivery')).toBe(true)
    expect(isPosRevenueDepositCategory('receivable_receive')).toBe(false)
  })

  it('normalizes revenue_* bulk import to receivable_receive with store', () => {
    expect(
      normalizeBulkImportDepositCategory({
        category: 'revenue_delivery',
        accountStore: 'CM Union Mall',
      })
    ).toEqual({ category: 'receivable_receive', storeName: 'CM Union Mall' })
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
