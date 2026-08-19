import { describe, expect, it } from 'vitest'
import { computeInboundBatchTaxableAmounts } from './inbound-payable-amount'
import type { ItemTaxType } from './income-statement-item-vat'
import { expenseDocumentQualifiesForPp30 } from './expense-document-type'
import {
  formatPp30Amount2,
  formatSellerBranch,
  gregorianYmdToBuddhistHint,
  isLikelyTaxInvoiceCopy,
  purchaseTaxInvoiceDedupeKey,
  PURCHASE_TAX_INVOICE_EXCEL_HEADERS,
  SELLER_BRANCH_HQ,
  taxMonthFromDocDate,
  validatePurchaseTaxInvoiceInput,
} from './purchase-tax-invoice-core'
import { buildPurchaseTaxInvoiceThaiAoa } from './purchase-tax-invoice-xlsx'

const taxMap = new Map<string, ItemTaxType>([
  ['TAX', 'taxable'],
  ['EX', 'exempt'],
  ['ZERO', 'zero'],
])

describe('expenseDocumentQualifiesForPp30', () => {
  it('never posts expense documents to PP.30 input VAT', () => {
    expect(expenseDocumentQualifiesForPp30({ documentType: 'tax_invoice' })).toBe(false)
    expect(expenseDocumentQualifiesForPp30({ documentType: 'invoice' })).toBe(false)
    expect(expenseDocumentQualifiesForPp30({ invoiceReceived: true })).toBe(false)
  })
})

describe('computeInboundBatchTaxableAmounts', () => {
  it('excludes VAT-exempt produce from มูลค่า and VAT', () => {
    const r = computeInboundBatchTaxableAmounts(
      [
        { code: 'TAX', qty: 1, unitCost: 100, dateYmd: '2026-07-15' },
        { code: 'EX', qty: 2, unitCost: 50, dateYmd: '2026-07-15' },
      ],
      taxMap
    )
    expect(r.taxableNet).toBe(100)
    expect(r.vatTotal).toBe(7)
    expect(r.exemptNet).toBe(100)
    expect(r.taxableGross).toBe(107)
  })

  it('one inbound invoice aggregates to one taxable total', () => {
    const r = computeInboundBatchTaxableAmounts(
      [
        { code: 'TAX', qty: 2, unitCost: 50, dateYmd: '2026-07-01' },
        { code: 'TAX', qty: 1, unitCost: 20, dateYmd: '2026-07-02' },
      ],
      taxMap
    )
    expect(r.taxableNet).toBe(120)
    expect(r.vatTotal).toBe(8.4)
    expect(r.batchDateYmd).toBe('2026-07-02')
  })
})

describe('purchase tax invoice helpers', () => {
  it('builds unique key per tax entity + invoice + seller TIN', () => {
    expect(purchaseTaxInvoiceDedupeKey('0105566137147', 'IV-1', '0105558123456')).toBe(
      '0105566137147|IV-1|0105558123456'
    )
    expect(purchaseTaxInvoiceDedupeKey('0105566137147', 'iv-1', '0105558123456')).toBe(
      purchaseTaxInvoiceDedupeKey('0105566137147', 'IV-1', '0105558123456')
    )
    expect(purchaseTaxInvoiceDedupeKey('0105566137147', 'IV-1', '0105558123456')).not.toBe(
      purchaseTaxInvoiceDedupeKey('0105568080622', 'IV-1', '0105558123456')
    )
  })

  it('formats seller branch as สำนักงานใหญ่ or สาขา 00001', () => {
    expect(formatSellerBranch('')).toBe(SELLER_BRANCH_HQ)
    expect(formatSellerBranch('HQ')).toBe(SELLER_BRANCH_HQ)
    expect(formatSellerBranch('1')).toBe('สาขา 00001')
    expect(formatSellerBranch('สาขา 00001')).toBe('สาขา 00001')
  })

  it('takes tax_month from invoice date', () => {
    expect(taxMonthFromDocDate('2026-07-31')).toBe('2026-07')
  })

  it('exports the staff 8-column Thai headers', () => {
    expect([...PURCHASE_TAX_INVOICE_EXCEL_HEADERS]).toEqual([
      'ลำดับที่',
      'วันที่ใบกำกับภาษี',
      'เลขที่ใบกำกับภาษี',
      'ชื่อผู้จำหน่าย',
      'เลขผู้เสียภาษี',
      'สำนักงานใหญ่/สาขา',
      'มูลค่า',
      'ภาษีมูลค่าเพิ่ม',
    ])
    const aoa = buildPurchaseTaxInvoiceThaiAoa([
      {
        id: 1,
        storeName: 'CM Office',
        buyerTaxId: '0105566137147',
        taxMonth: '2026-07',
        docDate: '2026-07-15',
        invoiceNo: 'INV-1',
        sellerName: 'Seller Co',
        sellerTaxId: '0105558123456',
        sellerBranch: SELLER_BRANCH_HQ,
        netAmount: 100.5,
        vatAmount: 7.04,
        totalAmount: 107.54,
        source: 'manual',
        inboundBatchId: null,
        attachmentUrls: [],
        memo: '',
      },
    ])
    expect(aoa[0]).toEqual([...PURCHASE_TAX_INVOICE_EXCEL_HEADERS])
    expect(aoa[1]?.[0]).toBe(1)
    expect(aoa[1]?.[1]).toBe('2026-07-15')
  })

  it('formats PP.30 cards to 2 decimal places', () => {
    expect(formatPp30Amount2(99581.9)).toBe('99,581.90')
    expect(formatPp30Amount2(99.581)).toBe('99.58')
  })

  it('requires 13-digit seller TIN', () => {
    expect(
      validatePurchaseTaxInvoiceInput({
        storeName: 'CM Office',
        buyerTaxId: '0105566137147',
        docDate: '2026-07-15',
        invoiceNo: 'A',
        sellerName: 'X',
        sellerTaxId: '123',
        netAmount: 10,
        vatAmount: 0.7,
      })
    ).toBe('seller_tax_id')
  })

  it('detects invoice copies to skip', () => {
    expect(isLikelyTaxInvoiceCopy('สำเนา')).toBe(true)
    expect(isLikelyTaxInvoiceCopy('True copy')).toBe(true)
    expect(isLikelyTaxInvoiceCopy('ต้นฉบับ')).toBe(false)
  })

  it('explains Buddhist year conversion', () => {
    expect(gregorianYmdToBuddhistHint('2026-07-01')).toContain('2569')
  })
})
