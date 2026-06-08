import { describe, expect, it } from 'vitest'
import {
  buildPayrollMonthPostgrestFilter,
  buildTaxMonthPostgrestFilter,
} from './thai-tax-period'

describe('buildTaxMonthPostgrestFilter', () => {
  it('uses tax_month column', () => {
    expect(buildTaxMonthPostgrestFilter(['2026-05'])).toBe('tax_month=eq.2026-05')
  })
})

describe('buildPayrollMonthPostgrestFilter', () => {
  it('uses month column for payroll_records', () => {
    expect(buildPayrollMonthPostgrestFilter(['2026-05'])).toBe('month=eq.2026-05')
  })
})
