import { describe, expect, it } from 'vitest'
import { buildTaxCloseChecklist, inventoryConfirmValid } from './tax-close-checklist'
import { parseFlowTrialBalanceSheet } from './tax-book-opening-parse'
import {
  recognizeTaxBook,
  taxJournalBalanced,
  taxPurchaseSummaryLines,
  taxSalesSummaryLines,
  voucherKindForSourceType,
} from './tax-book'

describe('tax close checklist', () => {
  it('orders steps and marks recognition from trial+VAT', () => {
    const recognition = recognizeTaxBook({
      schemaReady: true,
      taxEntryCount: 2,
      totalDebit: 100,
      totalCredit: 100,
      outputVatAccount: 7,
      filingOutputVat: 7,
      inputVatAccount: 3,
      filingInputVat: 3,
    })
    const steps = buildTaxCloseChecklist({
      hasOpening: true,
      hasVatSummary: true,
      hasSalesSummary: false,
      hasPurchaseSummary: true,
      hasPayroll: true,
      hasInventoryCogs: false,
      bridgeHoles: 2,
      recognition,
      periodClosed: false,
      schemaReady: true,
      entityReady: true,
    })
    expect(steps.map((s) => s.id)).toEqual([
      'opening',
      'vat',
      'sales',
      'purchase',
      'payroll',
      'inventory',
      'bridge',
      'recognize',
      'close',
    ])
    expect(steps.find((s) => s.id === 'sales')?.done).toBe(false)
    expect(steps.find((s) => s.id === 'recognize')?.done).toBe(true)
    expect(steps.find((s) => s.id === 'bridge')?.done).toBe(false)
    expect(steps.find((s) => s.id === 'close')?.blocked).toBe(false)
  })

  it('accepts confirmed inventory amounts', () => {
    expect(inventoryConfirmValid(100, 100)).toBe(true)
    expect(inventoryConfirmValid(100, 6117698.34)).toBe(true)
    expect(inventoryConfirmValid(100, -1)).toBe(false)
  })
})

describe('sales and purchase summaries', () => {
  it('builds balanced filing-base journals without POS lines', () => {
    const sales = taxSalesSummaryLines({ netAmount: 1000 })
    expect(taxJournalBalanced(sales)).toBe(true)
    expect(sales.find((l) => l.accountCode === '4110')?.side).toBe('credit')
    expect(voucherKindForSourceType('tax_sales_summary')).toBe('sales')

    const purchase = taxPurchaseSummaryLines({ netAmount: 400 })
    expect(taxJournalBalanced(purchase)).toBe(true)
    expect(purchase.find((l) => l.accountCode === '1460')?.side).toBe('debit')
    expect(purchase.find((l) => l.accountCode === '5110')).toBeUndefined()
    expect(voucherKindForSourceType('tax_purchase_summary')).toBe('purchase')
  })
})

describe('flow trial balance parse', () => {
  it('reads end debit/credit columns', () => {
    const rows = parseFlowTrialBalanceSheet([
      ['Account Code', 'Account Name', 'End Debit', 'End Credit'],
      ['11112', 'Cash', '1000', '0'],
      ['21311', 'AP', '0', '500'],
      ['', 'skip', '', ''],
    ])
    expect(rows).toEqual([
      { code: '11112', endDebit: 1000, endCredit: 0 },
      { code: '21311', endDebit: 0, endCredit: 500 },
    ])
  })
})
