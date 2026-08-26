import { describe, expect, it } from 'vitest'
import {
  assignForceOutboundInvoiceNos,
  forceOutboundInvoiceAccKey,
  forceOutboundInvoiceAnchorId,
  forceOutboundInvoiceGroupKey,
} from '@/lib/force-outbound-invoice'

describe('forceOutboundInvoiceGroupKey', () => {
  it('groups same date + store + reference', () => {
    expect(
      forceOutboundInvoiceGroupKey({ date: '2026-08-24', target: 'POS', referenceNo: '24082026' })
    ).toBe(['2026-08-24', 'POS', '24082026'].join('\u0000'))
  })

  it('returns null when reference is missing', () => {
    expect(forceOutboundInvoiceGroupKey({ date: '2026-08-24', target: 'POS', referenceNo: '' })).toBeNull()
  })
})

describe('assignForceOutboundInvoiceNos', () => {
  it('assigns one IVF from min stockLogId for the same confirm batch', () => {
    const rows = [
      { type: 'Force', date: '2026-08-24', target: 'POS', referenceNo: '24082026', stockLogId: 77262 },
      { type: 'Force', date: '2026-08-24', target: 'POS', referenceNo: '24082026', stockLogId: 77260 },
    ]
    assignForceOutboundInvoiceNos(rows)
    expect(rows[0].invoiceNo).toBe('IVF20260824-77260')
    expect(rows[1].invoiceNo).toBe('IVF20260824-77260')
  })

  it('keeps separate IVs when destination differs', () => {
    const rows = [
      { type: 'Force', date: '2026-08-24', target: 'POS', referenceNo: '24082026', stockLogId: 10 },
      { type: 'Force', date: '2026-08-24', target: 'CM006', referenceNo: '24082026', stockLogId: 11 },
    ]
    assignForceOutboundInvoiceNos(rows)
    expect(rows[0].invoiceNo).toBe('IVF20260824-10')
    expect(rows[1].invoiceNo).toBe('IVF20260824-11')
  })

  it('falls back to per-line IVF without reference', () => {
    const rows = [
      { type: 'Force', date: '2026-08-24', target: 'POS', stockLogId: 99 },
      { type: 'Force', date: '2026-08-24', target: 'POS', stockLogId: 100 },
    ]
    assignForceOutboundInvoiceNos(rows)
    expect(rows[0].invoiceNo).toBe('IVF20260824-99')
    expect(rows[1].invoiceNo).toBe('IVF20260824-100')
  })

  it('does not change order invoices', () => {
    const rows = [
      { type: 'Outbound', date: '2026-08-24', target: 'POS', stockLogId: 1, invoiceNo: 'IV20260824-88' },
    ]
    assignForceOutboundInvoiceNos(rows)
    expect(rows[0].invoiceNo).toBe('IV20260824-88')
  })
})

describe('forceOutboundInvoiceAccKey / anchor', () => {
  it('uses reference group then min id', () => {
    expect(
      forceOutboundInvoiceAccKey({
        ymd: '2026-08-24',
        target: 'POS',
        referenceNo: '24082026',
        stockLogId: 77262,
      })
    ).toBe(
      forceOutboundInvoiceAccKey({
        ymd: '2026-08-24',
        target: 'POS',
        referenceNo: '24082026',
        stockLogId: 77260,
      })
    )
    expect(forceOutboundInvoiceAnchorId([77262, 77260])).toBe(77260)
  })
})
