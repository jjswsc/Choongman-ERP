import { describe, it, expect } from 'vitest'
import { buildPnd91AnnualSummary, payrollGrossForPnd91, pnd91FilingDueDateForYear } from './pnd91-annual-summary'

describe('pnd91-annual-summary', () => {
  it('sums annual payroll per employee', () => {
    const summary = buildPnd91AnnualSummary({
      year: 2026,
      storeFilter: 'All',
      payrollRows: [
        {
          month: '2026-01',
          store: 'S1',
          name: 'Ann',
          employee_id: 10,
          salary: 20000,
          pos_allow: 1000,
          tax: 500,
          sso: 875,
          net_pay: 18625,
        },
        {
          month: '2026-02',
          store: 'S1',
          name: 'Ann',
          employee_id: 10,
          salary: 20000,
          tax: 500,
          sso: 875,
          net_pay: 19125,
        },
      ],
      whtRows: [
        {
          tax_month: '2026-01',
          store_name: 'S1',
          payee_name: 'Ann',
          wht_amount: 500,
          memo: '[AUTO:PAYROLL_RECORD_WHT:1] PND1',
          form_hint: 'PND1',
        },
        {
          tax_month: '2026-02',
          store_name: 'S1',
          payee_name: 'Ann',
          wht_amount: 500,
          memo: '[AUTO:PAYROLL_RECORD_WHT:2] PND1',
          form_hint: 'PND1',
        },
      ],
      taxIdByEmployeeId: new Map([[10, '1234567890123']]),
      taxIdByStoreName: new Map(),
    })

    expect(summary.employees).toHaveLength(1)
    expect(summary.employees[0]?.annualGross).toBe(41000)
    expect(summary.employees[0]?.annualWhtPayroll).toBe(1000)
    expect(summary.employees[0]?.annualWhtLedger).toBe(1000)
    expect(summary.employees[0]?.whtLedgerMismatch).toBe(false)
    expect(summary.employees[0]?.taxId).toBe('1234567890123')
    expect(summary.employees[0]?.monthCount).toBe(2)
  })

  it('payrollGrossForPnd91 includes allowances', () => {
    expect(
      payrollGrossForPnd91({
        salary: 100,
        pos_allow: 10,
        ot_amt: 5,
      })
    ).toBe(115)
  })

  it('filing due is next year March 31', () => {
    expect(pnd91FilingDueDateForYear(2026)).toBe('2027-03-31')
  })
})
