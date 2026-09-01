import { describe, expect, it } from 'vitest'
import {
  classifyPosRevenueDepositGuard,
  posRevenueDepositDoubleRiskMessage,
  shouldAssertPosRevenueDepositOnBankUpdate,
} from './bank-settlement-guards'

describe('classifyPosRevenueDepositGuard', () => {
  it('allows non-revenue categories', () => {
    expect(
      classifyPosRevenueDepositGuard({ category: 'receivable_receive', storeName: 'CM Ekkamai' })
    ).toBe('allow')
  })

  it('requires store for channel-memo revenue_* without store', () => {
    expect(
      classifyPosRevenueDepositGuard({
        category: 'revenue_delivery',
        storeName: '',
        memo: 'GRABFOOD UNION',
      })
    ).toBe('require_store')
  })

  it('allows revenue_* without store when memo is not a channel settlement', () => {
    expect(
      classifyPosRevenueDepositGuard({
        category: 'revenue_cash',
        storeName: '',
        memo: '기타 입금',
      })
    ).toBe('allow')
  })

  it('checks POS orders for revenue_* when store is set (no 4111 exception)', () => {
    expect(
      classifyPosRevenueDepositGuard({
        category: 'revenue_card',
        storeName: 'CM Ekkamai',
        memo: 'VISA',
      })
    ).toBe('check_pos_orders')
  })

  it('skips POS revenue re-assert when category is not in the update payload', () => {
    expect(shouldAssertPosRevenueDepositOnBankUpdate(false)).toBe(false)
    expect(shouldAssertPosRevenueDepositOnBankUpdate(true)).toBe(true)
  })

  it('formats a stable double-risk message for i18n mapping', () => {
    expect(posRevenueDepositDoubleRiskMessage('CM Seacon Srinakarin', 'revenue_delivery')).toContain(
      'CM Seacon Srinakarin'
    )
    expect(posRevenueDepositDoubleRiskMessage('CM Seacon Srinakarin', 'revenue_delivery')).toContain(
      'revenue_delivery'
    )
  })
})
