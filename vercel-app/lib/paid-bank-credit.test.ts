import { describe, expect, it } from 'vitest'
import {
  formatPaidBankAccountName,
  linesWithPaidBankCredit,
  PAID_BANK_GL_CODE,
} from './paid-bank-credit'

describe('paid bank credit on purchase vouchers', () => {
  it('joins bank name and account name', () => {
    expect(formatPaidBankAccountName({ bankName: 'กสิกรไทย', name: 'สำนักงานใหญ่' })).toBe(
      'กสิกรไทย · สำนักงานใหญ่'
    )
    expect(formatPaidBankAccountName({ bankName: 'กสิกรไทย', name: 'กสิกรไทย' })).toBe('กสิกรไทย')
    expect(formatPaidBankAccountName({ name: 'KBank HQ' })).toBe('KBank HQ')
  })

  it('replaces trade payables credit when the bank payment matches', () => {
    const applied = linesWithPaidBankCredit(
      [
        { accountCode: '5410', accountName: '임차료', debit: 12000, credit: 0 },
        { accountCode: '2110', accountName: '매입채무', debit: 0, credit: 12000 },
      ],
      { accountCode: PAID_BANK_GL_CODE, accountName: 'กสิกรไทย · สำนักงานใหญ่', amount: 12000 }
    )
    expect(applied.replaced).toBe(true)
    expect(applied.lines[1]).toMatchObject({
      accountCode: '1010',
      accountName: 'กสิกรไทย · สำนักงานใหญ่',
      credit: 12000,
    })
  })

  it('leaves an unpaid or partial payable credit unchanged', () => {
    const lines = [{ accountCode: '2110', accountName: '매입채무', credit: 12000 }]
    expect(linesWithPaidBankCredit(lines, null).replaced).toBe(false)
    expect(
      linesWithPaidBankCredit(lines, {
        accountCode: '1010',
        accountName: 'KBank',
        amount: 5000,
      }).replaced
    ).toBe(false)
  })
})
