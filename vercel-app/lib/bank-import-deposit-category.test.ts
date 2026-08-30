import { describe, expect, it } from 'vitest'
import {
  coercePosStoreImportDepositCategory,
  filterBankDepositUiCategories,
  isChannelRevenueAccountCode,
  isNonRetryableBankBusinessErrorMessage,
  isPosChannelSettlementMemo,
  isPosRevenueDepositCategory,
  isPosStoreBankAccount,
  shouldShowPosRevenueDepositSelectOption,
} from '@/lib/bank-import-deposit-category'

describe('bank-import-deposit-category', () => {
  it('detects POS revenue deposit categories', () => {
    expect(isPosRevenueDepositCategory('revenue_delivery')).toBe(true)
    expect(isPosRevenueDepositCategory('receivable_receive')).toBe(false)
  })

  it('treats GRABFOOD as a channel settlement memo', () => {
    expect(isPosChannelSettlementMemo('GRABFOOD UNION')).toBe(true)
    expect(isPosChannelSettlementMemo('VISA SETTLEMENT')).toBe(true)
    expect(isPosChannelSettlementMemo('기타 입금')).toBe(false)
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

  it('hides revenue_* in POS store deposit select except the row current value', () => {
    expect(
      shouldShowPosRevenueDepositSelectOption({
        hideForPosStore: true,
        currentCategory: 'receivable_receive',
        option: 'revenue_card',
      })
    ).toBe(false)
    expect(
      shouldShowPosRevenueDepositSelectOption({
        hideForPosStore: true,
        currentCategory: 'revenue_card',
        option: 'revenue_card',
      })
    ).toBe(true)
    expect(
      shouldShowPosRevenueDepositSelectOption({
        hideForPosStore: true,
        currentCategory: 'revenue_card',
        option: 'revenue_delivery',
      })
    ).toBe(false)
    expect(
      filterBankDepositUiCategories({ hidePosRevenue: true, currentCategory: 'receivable_receive' })
    ).not.toContain('revenue_delivery')
    expect(
      filterBankDepositUiCategories({ hidePosRevenue: true, currentCategory: 'revenue_qr' })
    ).toContain('revenue_qr')
  })

  it('does not treat HQ bank accounts as POS stores for the deposit dropdown', () => {
    expect(isPosStoreBankAccount('CM Office', ['CM Office', 'CM Ekkamai'])).toBe(false)
    expect(isPosStoreBankAccount('CM Ekkamai', ['CM Ekkamai'])).toBe(true)
    expect(isPosStoreBankAccount('Ekkamai', ['CM Ekkamai'])).toBe(true)
    expect(isPosStoreBankAccount('', ['CM Ekkamai'])).toBe(false)
  })
})
