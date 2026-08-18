import { describe, expect, it } from 'vitest'
import { evaluatePayeeBankMemoMatch } from '@/lib/expense-accrual-bank-memo-match'

describe('evaluatePayeeBankMemoMatch tax remittance', () => {
  it('treats RD bank memo vs auto tax withholding payee as a match', () => {
    const ev = evaluatePayeeBankMemoMatch({
      bankMemo: 'Payment | Paid for Ref X0622 REVENUE DEPARTMENT',
      bankNote: '',
      payeeName: 'ชำระภาษีหัก ณ ที่จ่าย',
      payeeCode: 'auto_tax_withholding',
      withdrawalCategory: 'tax_withholding',
    })
    expect(ev.quality).toBe('ok')
  })

  it('still flags a long unrelated memo against a generic expense payee', () => {
    const ev = evaluatePayeeBankMemoMatch({
      bankMemo: 'Payment | Paid for Ref X0622 ACME PROPERTY MANAGEMENT LTD',
      bankNote: '',
      payeeName: 'Office supplies shop',
      payeeCode: 'SUPPLY01',
      withdrawalCategory: 'expense',
    })
    expect(ev.quality).toBe('mismatch')
  })
})
