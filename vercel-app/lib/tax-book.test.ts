import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  TAX_CLOSE_LOCKS_STORE_PERIOD,
  formatTaxVoucherNo,
  recognizeTaxBook,
  taxEntityKeyFromScope,
  taxInventoryCogsLines,
  taxJournalBalanced,
  taxPayrollJournalLines,
  voucherKindForSourceType,
} from './tax-book'
import { buildTaxManagementBridge } from './tax-management-bridge'
import type { TrialBalanceRow } from './trial-balance-report'

function row(code: string, debit: number, credit: number): TrialBalanceRow {
  return { accountCode: code, accountName: code, debit, credit, netDebit: debit - credit }
}

describe('tax book rules', () => {
  it('maps voucher kinds and document numbers', () => {
    expect(voucherKindForSourceType('tax_payroll')).toBe('general')
    expect(voucherKindForSourceType('tax_income_expense_closing')).toBe('closing')
    expect(voucherKindForSourceType('pos_order')).toBe('sales')
    expect(formatTaxVoucherNo('sales', '2026-09', 2)).toBe('SV2026090002')
  })

  it('accepts only an entity or 13-digit TIN as the tax book key', () => {
    expect(taxEntityKeyFromScope('entity:omni-foodtech-01')).toBe('omni-foodtech-01')
    expect(taxEntityKeyFromScope('taxid:0105551234567')).toBe('tin:0105551234567')
    expect(taxEntityKeyFromScope('Silom')).toBeNull()
    expect(taxEntityKeyFromScope('All')).toBeNull()
  })

  it('balances payroll and inventory journals', () => {
    const payroll = taxPayrollJournalLines({ gross: 1000, tax: 30, sso: 50 })
    expect(taxJournalBalanced(payroll)).toBe(true)
    expect(payroll.find((l) => l.accountCode === '5310')?.amount).toBe(1000)
    const cogs = taxInventoryCogsLines(250)
    expect(taxJournalBalanced(cogs)).toBe(true)
    expect(taxInventoryCogsLines(0)).toEqual([])
  })

  it('recognizes a month only when the tax trial balances and VAT ties', () => {
    expect(
      recognizeTaxBook({
        schemaReady: true,
        taxEntryCount: 2,
        totalDebit: 100,
        totalCredit: 100,
        outputVatAccount: 70,
        inputVatAccount: 20,
        filingOutputVat: 70,
        filingInputVat: 20,
      }).recognized
    ).toBe(true)
    expect(
      recognizeTaxBook({
        schemaReady: true,
        taxEntryCount: 1,
        totalDebit: 100,
        totalCredit: 100,
        outputVatAccount: 0,
        inputVatAccount: 0,
        filingOutputVat: 70,
        filingInputVat: 20,
      }).recognized
    ).toBe(false)
  })

  it('does not lock the store accounting period', () => {
    expect(TAX_CLOSE_LOCKS_STORE_PERIOD).toBe(false)
  })
})

describe('tax management bridge', () => {
  it('shows payroll and VAT holes without requiring the books to match', () => {
    const report = buildTaxManagementBridge({
      schemaReady: true,
      management: { sales: 1000, cogs: 400, payroll: 300, netProfit: 200 },
      journalRows: [row('4110', 0, 1000), row('5110', 100, 0)],
      taxBookRows: [],
      taxBookDebit: 0,
      taxBookCredit: 0,
      taxEntryCount: 0,
      filing: { outputVat: 70, outputNet: 1000, inputVat: 28, payrollWht: 30 },
    })
    expect(report.holes).toContain('payroll')
    expect(report.holes).toContain('cogs')
    expect(report.holes).toContain('outputVat')
    expect(report.recognition.recognized).toBe(false)
    const sales = report.lines.find((l) => l.key === 'sales')
    expect(sales?.management).toBe(1000)
    expect(sales?.journal).toBe(1000)
  })
})

describe('management reports stay off the tax book', () => {
  it('income statement code does not read tax periods or tax-only journals', () => {
    const src = readFileSync(new URL('./accounting-reports.ts', import.meta.url), 'utf8')
    expect(src.includes('tax_accounting_periods')).toBe(false)
    expect(src.includes('tax_payroll')).toBe(false)
    expect(src.includes("book=eq.tax")).toBe(false)
  })

  it('store trial balance drops tax_ source types', () => {
    const src = readFileSync(new URL('./trial-balance-report.ts', import.meta.url), 'utf8')
    expect(src.includes("startsWith('tax_')")).toBe(true)
  })
})
