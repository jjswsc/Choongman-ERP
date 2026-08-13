import { describe, expect, it } from 'vitest'
import {
  buildTaxInvoiceDocNo,
  extractPurchaseOrderNoFromText,
  isAccountingPoReceivableInvoiceNo,
  isOutboundReceivableInvoiceNo,
  isTaxInvoiceDocumentNo,
  isUnsuitableTaxInvoiceReferenceNo,
  parseTaxInvoiceDocNoSuffix,
  resolveTaxInvoiceSourceReferenceNo,
} from '@/lib/tax-invoice-doc-no'

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

  it('detects accounting PO receivable numbers', () => {
    expect(isAccountingPoReceivableInvoiceNo('APO20260807-205')).toBe(true)
    expect(isAccountingPoReceivableInvoiceNo('APO#205')).toBe(true)
    expect(isAccountingPoReceivableInvoiceNo('PO-20260807-4180')).toBe(false)
  })
})

describe('resolveTaxInvoiceSourceReferenceNo', () => {
  it('uses PO invoice number instead of APO ledger number', () => {
    expect(
      resolveTaxInvoiceSourceReferenceNo({
        savedReferenceNo: 'APO20260807-205',
        businessDocumentNo: 'PO-20260807-4180',
        ledgerInvoiceNo: 'APO20260807-205',
        documentNo: 'IV.20260807-002',
      })
    ).toBe('PO-20260807-4180')
  })

  it('keeps a user-saved custom reference', () => {
    expect(
      resolveTaxInvoiceSourceReferenceNo({
        savedReferenceNo: 'CUSTOM-REF-1',
        businessDocumentNo: 'PO-20260807-4180',
        ledgerInvoiceNo: 'APO20260807-205',
      })
    ).toBe('CUSTOM-REF-1')
  })

  it('falls back to APO when PO number is missing', () => {
    expect(
      resolveTaxInvoiceSourceReferenceNo({
        savedReferenceNo: 'APO20260807-205',
        businessDocumentNo: '',
        ledgerInvoiceNo: 'APO20260807-205',
      })
    ).toBe('APO20260807-205')
  })

  it('treats tax document no copied into reference as unsuitable', () => {
    expect(isUnsuitableTaxInvoiceReferenceNo('IV.20260807-002', 'IV.20260807-002')).toBe(true)
    expect(extractPurchaseOrderNoFromText('회계발주 PO-20260807-4180')).toBe('PO-20260807-4180')
  })
})
