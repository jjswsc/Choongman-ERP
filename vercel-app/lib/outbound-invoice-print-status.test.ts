import { describe, expect, it } from 'vitest'
import {
  applyOutboundBillPlacedStatus,
  collectOutboundInvoiceNosForPrintStatus,
  isOutboundPrintStatusInvoiceNo,
  unmatchedOutboundBillLookupIds,
} from '@/lib/outbound-invoice-print-status'

describe('isOutboundPrintStatusInvoiceNo', () => {
  it('accepts outbound IV/IVF and rejects tax invoice IV. numbers', () => {
    expect(isOutboundPrintStatusInvoiceNo('IV20260807-2231')).toBe(true)
    expect(isOutboundPrintStatusInvoiceNo('IVF20260807-99')).toBe(true)
    expect(isOutboundPrintStatusInvoiceNo('IV.20260807-001')).toBe(false)
    expect(isOutboundPrintStatusInvoiceNo('-')).toBe(false)
    expect(isOutboundPrintStatusInvoiceNo('')).toBe(false)
  })
})

describe('collectOutboundInvoiceNosForPrintStatus', () => {
  it('saves Document No even when Reference is a dash', () => {
    expect(
      collectOutboundInvoiceNosForPrintStatus([
        { documentNo: 'IV20260807-2231', referenceNo: '-', sourceRefType: 'Order', sourceRefId: 2231 },
      ])
    ).toEqual(['IV20260807-2231'])
  })

  it('keeps IV in Reference (AR tax invoice) and ignores tax document numbers', () => {
    const nos = collectOutboundInvoiceNosForPrintStatus([
      {
        documentNo: 'IV.20260807-012',
        referenceNo: 'IV20260807-2224',
        sourceRefType: 'Order',
        sourceRefId: 2224,
        issueDate: '2026-08-07',
      },
    ])
    expect(nos).toContain('IV20260807-2224')
    expect(nos.some((n) => n.includes('.'))).toBe(false)
  })

  it('reconstructs IV from Order source when Document No is tax format', () => {
    const nos = collectOutboundInvoiceNosForPrintStatus([
      {
        documentNo: 'IV.20260811-003',
        referenceNo: 'PO-20260811-1',
        sourceRefType: 'Order',
        sourceRefId: 2218,
        issueDate: '2026-08-11',
      },
    ])
    expect(nos).toEqual(['IV20260811-2218'])
  })
})

describe('applyOutboundBillPlacedStatus', () => {
  it('marks billed by exact invoice no', () => {
    const rows = [{ invoiceNo: 'IV20260807-2224', orderRowId: '2224' }]
    applyOutboundBillPlacedStatus(rows, [
      { invoice_no: 'IV20260807-2224', printed: true, printed_at: '2026-08-07 10:00' },
    ])
    expect(rows[0].billPlaced).toBe(true)
    expect(rows[0].billPlacedAt).toBe('2026-08-07 10:00')
  })

  it('marks billed when saved IV date differs from displayed outbound date', () => {
    const rows = [{ invoiceNo: 'IV20260807-2231', orderRowId: '2231', type: 'Outbound' }]
    applyOutboundBillPlacedStatus(rows, [
      { invoice_no: 'IV20260806-2231', printed: true, printed_at: '2026-08-06 18:00' },
    ])
    expect(rows[0].billPlaced).toBe(true)
    expect(rows[0].billPlacedAt).toBe('2026-08-06 18:00')
  })

  it('does not treat a longer order id as a match', () => {
    const rows = [{ invoiceNo: 'IV20260807-2231', orderRowId: '2231' }]
    applyOutboundBillPlacedStatus(rows, [
      { invoice_no: 'IV20260807-12231', printed: true, printed_at: '2026-08-07 10:00' },
    ])
    expect(rows[0].billPlaced).toBeUndefined()
  })
})

describe('unmatchedOutboundBillLookupIds', () => {
  it('returns only rows that are not yet billed', () => {
    const ids = unmatchedOutboundBillLookupIds([
      { invoiceNo: 'IV20260807-2224', orderRowId: '2224', billPlaced: true },
      { invoiceNo: 'IV20260807-2231', orderRowId: '2231' },
      { invoiceNo: 'IVF20260807-88', stockLogId: 88, type: 'Force' },
    ])
    expect(ids.orderIds).toEqual(['2231'])
    expect(ids.forceStockLogIds).toEqual(['88'])
  })
})
