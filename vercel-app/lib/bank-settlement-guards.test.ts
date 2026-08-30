import { describe, expect, it } from 'vitest'
import { classifyPosRevenueDepositGuard } from './bank-settlement-guards'

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
})
