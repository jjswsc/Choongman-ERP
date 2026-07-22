import { describe, expect, it } from 'vitest'
import {
  formatAccountingPoInvoiceNo,
  formatForceOutboundInvoiceNo,
  formatReceivableInvoiceNo,
  resolveReceivableOrderNoDisplay,
  resolveReceivableTaxInvoiceDocNoDisplay,
} from '@/lib/receivable-invoice-format'

describe('formatReceivableInvoiceNo', () => {
  it('builds outbound IV without dot', () => {
    expect(formatReceivableInvoiceNo(1830, '2026-07-17')).toBe('IV20260717-1830')
  })
})

describe('formatForceOutboundInvoiceNo / formatAccountingPoInvoiceNo', () => {
  it('builds IVF / APO', () => {
    expect(formatForceOutboundInvoiceNo(99, '2026-07-17')).toBe('IVF20260717-99')
    expect(formatAccountingPoInvoiceNo(12, '2026-07-17')).toBe('APO20260717-12')
  })
})

describe('resolveReceivableOrderNoDisplay', () => {
  it('keeps outbound invoice numbers', () => {
    expect(
      resolveReceivableOrderNoDisplay({
        ref_type: 'Order',
        ref_id: 1830,
        invoice_no: 'IV20260717-1830',
        trans_date: '2026-07-17',
      })
    ).toBe('IV20260717-1830')
  })

  it('restores outbound when Tax Invoice number was wrongly stored', () => {
    expect(
      resolveReceivableOrderNoDisplay({
        ref_type: 'Order',
        ref_id: 2050,
        invoice_no: 'IV.20260717-011',
        trans_date: '2026-07-17',
      })
    ).toBe('IV20260717-2050')
  })

  it('restores ForceOutbound and AccountingPO', () => {
    expect(
      resolveReceivableOrderNoDisplay({
        ref_type: 'ForceOutbound',
        ref_id: 55,
        invoice_no: 'IV.20260717-011',
        trans_date: '2026-07-17',
      })
    ).toBe('IVF20260717-55')
    expect(
      resolveReceivableOrderNoDisplay({
        ref_type: 'AccountingPO',
        ref_id: 8,
        invoice_no: 'IV.20260717-003',
        trans_date: '2026-07-17',
      })
    ).toBe('APO20260717-8')
  })
})

describe('resolveReceivableTaxInvoiceDocNoDisplay', () => {
  it('prefers override documentNo', () => {
    expect(
      resolveReceivableTaxInvoiceDocNoDisplay(
        { ref_type: 'Order', ref_id: 2050, invoice_no: 'IV20260717-2050' },
        { 'invoice_print_override:tax:Order:2050': { documentNo: 'IV.20260717-011' } }
      )
    ).toBe('IV.20260717-011')
  })

  it('falls back to legacy tax number in invoice_no', () => {
    expect(
      resolveReceivableTaxInvoiceDocNoDisplay({
        ref_type: 'Order',
        ref_id: 2050,
        invoice_no: 'IV.20260717-011',
      })
    ).toBe('IV.20260717-011')
  })
})
