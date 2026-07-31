import { describe, expect, it } from 'vitest'
import {
  aggregateOfficeNetPayByStore,
  buildOfficePayrollAggregatePayeeCode,
  isOfficePayrollAggregatePayeeCode,
} from '@/lib/payroll-office-expense-sync-calc'

const isOffice = (s: string) => /office/i.test(s) || s === '본사' || s === 'HQ'

describe('payroll-office-expense-sync-calc', () => {
  it('builds aggregate payee code without employee name', () => {
    const code = buildOfficePayrollAggregatePayeeCode('2026-07', 'CM Office')
    expect(code).toBe('payroll-2026-07-cm-office-agg::wm::expense')
    expect(isOfficePayrollAggregatePayeeCode(code)).toBe(true)
    expect(
      isOfficePayrollAggregatePayeeCode('payroll-2026-07-cm-office-vilaisak-id1173::wm::expense')
    ).toBe(false)
  })

  it('aggregates only office stores by net pay', () => {
    const map = aggregateOfficeNetPayByStore(
      [
        { store: 'CM Office', netPay: 21125, name: 'A' },
        { store: 'CM Office', netPay: 37354, name: 'B' },
        { store: 'Union Mall', netPay: 15000, name: 'C' },
        { store: 'CM Office', netPay: 0, name: 'D' },
      ],
      isOffice
    )
    expect(map.size).toBe(1)
    expect(map.get('CM Office')).toEqual({ totalBaht: 58479, employeeCount: 2 })
  })
})
