import { describe, expect, it } from 'vitest'
import { buildExpenseAccrualPlanDateFilters } from '@/lib/expense-accrual-plan-filters'

describe('buildExpenseAccrualPlanDateFilters', () => {
  it('uses ampersand AND filters for a date range (not or=and)', () => {
    const filters = buildExpenseAccrualPlanDateFilters('2026-05-27', '2026-05-27')
    expect(filters).toHaveLength(2)
    expect(filters[0]).toBe('expense_date=gte.2026-05-27&expense_date=lte.2026-05-27')
    expect(filters[1]).toBe('due_date=gte.2026-05-27&due_date=lte.2026-05-27')
    expect(filters.some((f) => f.includes('or=('))).toBe(false)
  })

  it('falls back to all rows when no bounds', () => {
    expect(buildExpenseAccrualPlanDateFilters('', '')).toEqual(['id=gt.0'])
  })
})
