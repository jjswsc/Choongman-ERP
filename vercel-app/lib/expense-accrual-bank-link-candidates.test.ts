import { describe, expect, it } from 'vitest'
import {
  accrualDateMatchesBankDate,
  accrualDateWithinBankWindow,
  buildExpenseAccrualBankLinkAmountFilters,
  buildExpenseAccrualBankLinkDateFilters,
  chunkIdsForInFilter,
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

  it('builds amount filters for gross and deduction headroom', () => {
    const filters = buildExpenseAccrualBankLinkAmountFilters(2200)
    expect(filters).toHaveLength(2)
    expect(filters[0]).toContain('amount=gte.2199.98')
    expect(filters[0]).toContain('amount=lte.2200.02')
    expect(filters[1]).toContain('amount=gte.2200')
    expect(filters[1]).toMatch(/amount=lte\.2588/)
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
})
