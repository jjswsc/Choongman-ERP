import { describe, expect, it } from 'vitest'
import { invoiceFilterCandidates, rowMatchesInvoiceFilter } from '@/lib/receivable-payable-invoice-filter'

describe('receivable-payable-invoice-filter', () => {
  it('matches invoice_no partial', () => {
    expect(rowMatchesInvoiceFilter({ invoice_no: 'IV20260713-42' }, '20260713')).toBe(true)
    expect(rowMatchesInvoiceFilter({ invoice_no: 'IV20260713-42' }, '42')).toBe(true)
    expect(rowMatchesInvoiceFilter({ invoice_no: 'IV20260713-42' }, '999')).toBe(false)
  })

  it('matches synthetic accounting PO numbers', () => {
    const row = { ref_type: 'AccountingPO', ref_id: 15, trans_date: '2026-07-13' }
    expect(invoiceFilterCandidates(row)).toContain('APO#15')
    expect(rowMatchesInvoiceFilter(row, 'apo#15')).toBe(true)
  })

  it('matches order IV pattern from ref_id', () => {
    const row = { ref_type: 'Order', ref_id: 99, trans_date: '2026-07-13', invoice_no: 'IV20260713-99' }
    expect(rowMatchesInvoiceFilter(row, 'iv20260713-99')).toBe(true)
    expect(rowMatchesInvoiceFilter(row, '#99')).toBe(true)
  })

  it('empty query matches all', () => {
    expect(rowMatchesInvoiceFilter({ invoice_no: 'X' }, '')).toBe(true)
    expect(rowMatchesInvoiceFilter({ invoice_no: 'X' }, '   ')).toBe(true)
  })
})
