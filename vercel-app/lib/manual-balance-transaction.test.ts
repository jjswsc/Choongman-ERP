import { describe, expect, it } from 'vitest'
import {
  isManualPayableBalanceRow,
  isManualReceivableBalanceRow,
  signedAmountForManualBalance,
} from '@/lib/manual-balance-transaction'
import { canMutateManualPayableBalance, canMutateManualReceivableBalance } from '@/lib/permissions'

describe('manual-balance-transaction', () => {
  it('identifies manual receivable rows', () => {
    expect(isManualReceivableBalanceRow({ ref_type: 'Receive', ref_id: null, bank_transaction_id: null })).toBe(true)
    expect(isManualReceivableBalanceRow({ ref_type: 'Opening', ref_id: null })).toBe(true)
    expect(isManualReceivableBalanceRow({ ref_type: 'Receive', bank_transaction_id: 9 })).toBe(false)
    expect(isManualReceivableBalanceRow({ ref_type: 'Order', ref_id: 1 })).toBe(false)
  })

  it('identifies manual payable rows', () => {
    expect(isManualPayableBalanceRow({ ref_type: 'Payment', ref_id: null, bank_transaction_id: null })).toBe(true)
    expect(isManualPayableBalanceRow({ ref_type: 'PO', ref_id: 12 })).toBe(false)
    expect(isManualPayableBalanceRow({ ref_type: 'Payment', expense_accrual_id: 3 })).toBe(false)
  })

  it('signs amounts for receive vs opening', () => {
    expect(signedAmountForManualBalance('receivable', 'Receive', 100)).toBe(-100)
    expect(signedAmountForManualBalance('receivable', 'Opening', 100)).toBe(100)
    expect(signedAmountForManualBalance('payable', 'Payment', 50)).toBe(-50)
  })
})

describe('canMutateManualReceivableBalance', () => {
  it('allows office for any store and franchisee for own store', () => {
    expect(canMutateManualReceivableBalance('director', 'Office', 'CM Rama9')).toBe(true)
    expect(canMutateManualPayableBalance('director')).toBe(true)
    expect(canMutateManualPayableBalance('manager')).toBe(false)
    expect(canMutateManualReceivableBalance('franchisee', 'CM Rama9', 'CM Rama9')).toBe(true)
    expect(canMutateManualReceivableBalance('franchisee', 'CM Rama9', 'CM Ladprao')).toBe(false)
  })
})
