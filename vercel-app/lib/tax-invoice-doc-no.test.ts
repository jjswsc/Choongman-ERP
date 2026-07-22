import { describe, expect, it } from 'vitest'
import { buildTaxInvoiceDocNo, isOutboundReceivableInvoiceNo, isTaxInvoiceDocumentNo, parseTaxInvoiceDocNoSuffix } from '@/lib/tax-invoice-doc-no'

describe('buildTaxInvoiceDocNo', () => {
  it('shows full YYYYMMDD and zero-padded seq', () => {
    expect(buildTaxInvoiceDocNo('2026-07-13', 3)).toBe('IV.20260713-003')
    expect(buildTaxInvoiceDocNo('2026-06-04', 632)).toBe('IV.20260604-632')
  })

  it('clamps invalid seq to at least 1', () => {
    expect(buildTaxInvoiceDocNo('2026-07-13', 0)).toBe('IV.20260713-001')
  })
})

describe('parseTaxInvoiceDocNoSuffix', () => {
  it('extracts suffix from new format', () => {
    expect(parseTaxInvoiceDocNoSuffix('IV.20260713-003')).toBe(3)
    expect(parseTaxInvoiceDocNoSuffix('IV.20260713-1001')).toBe(1001)
  })

  it('returns null for legacy masked format', () => {
    expect(parseTaxInvoiceDocNoSuffix('IV.202606XX-632')).toBeNull()
  })
})

describe('invoice no format helpers', () => {
  it('distinguishes outbound vs tax invoice numbers', () => {
    expect(isOutboundReceivableInvoiceNo('IV20260629-1830')).toBe(true)
    expect(isTaxInvoiceDocumentNo('IV20260629-1830')).toBe(false)
    expect(isTaxInvoiceDocumentNo('IV.20260629-003')).toBe(true)
    expect(isOutboundReceivableInvoiceNo('IV.20260629-003')).toBe(false)
  })
})
