import { describe, expect, it } from 'vitest'
import {
  accrualDateMatchesBankDate,
  accrualDateWithinBankWindow,
  buildExpenseAccrualBankLinkAmountFilters,
  buildExpenseAccrualBankLinkDateFilters,
  buildExpenseAccrualBankLinkPeriodFilters,
  chunkIdsForInFilter,
  filterExpenseAccrualsByBankStore,
  isPayrollExpenseAccrualForBankLink,
} from './expense-accrual-bank-link-candidates'

describe('expense-accrual-bank-link-candidates', () => {
  it('builds two flat date-window filters (no nested or=and)', () => {
    const filters = buildExpenseAccrualBankLinkDateFilters('2026-08-07', 45)
    expect(filters).toHaveLength(2)
    expect(filters[0]).toContain('status=in.(planned,approved,partial,paid,done)')
    expect(filters[0]).toContain('expense_date=gte.2026-06-23')
    expect(filters[0]).toContain('expense_date=lte.2026-09-21')
    expect(filters[1]).toContain('due_date=gte.2026-06-23')
    expect(filters[1]).toContain('due_date=lte.2026-09-21')
    for (const f of filters) {
      expect(f).not.toContain('or=(')
      expect(f).not.toContain('and(')
    }
  })

  it('builds explicit period filters for combo search', () => {
    const filters = buildExpenseAccrualBankLinkPeriodFilters('2026-08-01', '2026-08-27')
    expect(filters).toHaveLength(2)
    expect(filters[0]).toContain('expense_date=gte.2026-08-01')
    expect(filters[0]).toContain('expense_date=lte.2026-08-27')
    expect(filters[1]).toContain('due_date=gte.2026-08-01')
    expect(filters[1]).toContain('due_date=lte.2026-08-27')
  })

  it('builds amount filters: open exact, all exact, WHT headroom', () => {
    const filters = buildExpenseAccrualBankLinkAmountFilters(2200)
    expect(filters).toHaveLength(3)
    expect(filters[0]).toContain('status=in.(planned,approved,partial)')
    expect(filters[0]).toContain('amount=gte.2199.98')
    expect(filters[0]).toContain('amount=lte.2200.02')
    expect(filters[1]).toContain('status=in.(planned,approved,partial,paid,done)')
    expect(filters[1]).toContain('amount=gte.2199.98')
    expect(filters[2]).toContain('amount=gte.2200')
    expect(filters[2]).toMatch(/amount=lte\.2588/)
    for (const f of filters) {
      expect(f).not.toContain('or=(')
    }
  })

  it('matches expense or due date to bank date', () => {
    expect(accrualDateMatchesBankDate('2026-08-07', '2026-08-10', '2026-08-07')).toBe(true)
    expect(accrualDateMatchesBankDate('2026-08-01', '2026-08-07', '2026-08-07')).toBe(true)
    expect(accrualDateMatchesBankDate('2026-08-01', '2026-08-02', '2026-08-07')).toBe(false)
  })

  it('detects dates inside bank window', () => {
    expect(accrualDateWithinBankWindow('2026-08-10', '', '2026-08-07', 45)).toBe(true)
    expect(accrualDateWithinBankWindow('2026-01-01', '', '2026-08-07', 45)).toBe(false)
  })

  it('chunks ids for in-filter', () => {
    expect(chunkIdsForInFilter([1, 2, 2, 3], 2)).toEqual([
      [1, 2],
      [3],
    ])
  })

  it('detects payroll expense accruals for bank-link exclusion', () => {
    expect(
      isPayrollExpenseAccrualForBankLink({
        payeeCode: 'payroll-2026-07-cm-silom-na-id1367',
        payeeName: 'อภิชาติ เหินฟ้า',
      })
    ).toBe(true)
    expect(
      isPayrollExpenseAccrualForBankLink({
        payeeCode: 'payroll-2026-07-cm-office-agg::wm::expense',
      })
    ).toBe(true)
    expect(
      isPayrollExpenseAccrualForBankLink({
        payeeCode: 'vendor-1008',
        memo: '[PAYROLL] 2026-07 CM Silom',
      })
    ).toBe(true)
    expect(
      isPayrollExpenseAccrualForBankLink({
        payeeCode: '1008',
        payeeName: 'บางกอกแมน',
        memo: 'ค่าเช่า',
      })
    ).toBe(false)
    expect(
      isPayrollExpenseAccrualForBankLink({
        payeeCode: 'sso-2026-07-cm-silom::wm::expense',
        memo: 'SSO remittance',
      })
    ).toBe(false)
  })

  it('filters candidates to bank store only (no cross-store amount merge)', () => {
    const rows = [
      { id: 1, storeName: 'CM Silom', remainingAmount: 2200 },
      { id: 2, storeName: 'Head Office (HQ)', remainingAmount: 2200 },
      { id: 3, storeName: '', remainingAmount: 2200 },
      { id: 4, storeName: 'CM Silom', remainingAmount: 500 },
    ]
    const match = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
    expect(filterExpenseAccrualsByBankStore(rows, 'CM Silom', match).map((r) => r.id)).toEqual([1, 4])
    expect(filterExpenseAccrualsByBankStore(rows, '', match)).toEqual(rows)
  })
})
