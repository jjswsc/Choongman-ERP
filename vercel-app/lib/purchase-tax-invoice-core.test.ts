import { describe, expect, it } from 'vitest'
import { computeInboundBatchTaxableAmounts } from './inbound-payable-amount'
import type { ItemTaxType } from './income-statement-item-vat'
import { expenseDocumentQualifiesForPp30 } from './expense-document-type'
import {
  displaySellerBranchForUi,
  formatPp30Amount2,
  formatSellerBranch,
  gregorianYmdToBuddhistHint,
  isLikelyTaxInvoiceCopy,
  looksLikeJunkSellerName,
  parsePurchaseTaxInvoiceVisionPayload,
  purchaseTaxDocMonthMismatch,
  purchaseTaxInvoiceDedupeKey,
  purchaseTaxInvoiceHasExtractedFields,
  purchaseTaxReviewFlags,
  purchaseTaxReviewIsProblem,
  purchaseTaxPp30Compare,
  purchaseTaxVatLooksWrong,
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
    expect(formatSellerBranch('본점')).toBe(SELLER_BRANCH_HQ)
    expect(formatSellerBranch('지점 1')).toBe('สาขา 00001')
    expect(formatSellerBranch('1')).toBe('สาขา 00001')
    expect(formatSellerBranch('สาขา 00001')).toBe('สาขา 00001')
  })

  it('shows blank for head office and digits only for branch in the UI', () => {
    expect(displaySellerBranchForUi('')).toBe('')
    expect(displaySellerBranchForUi(SELLER_BRANCH_HQ)).toBe('')
    expect(displaySellerBranchForUi('สาขา 00001')).toBe('00001')
    expect(displaySellerBranchForUi('1')).toBe('00001')
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

  it('allows exempt invoices with 0 net and 0 VAT', () => {
    expect(
      validatePurchaseTaxInvoiceInput({
        storeName: 'CM Office',
        buyerTaxId: '0105566137147',
        docDate: '2026-07-08',
        invoiceNo: 'INV-20260546501',
        sellerName: 'บริษัท โพลาร์ แบร์ มิชชั่น จำกัด',
        sellerTaxId: '0105559082715',
        netAmount: 0,
        vatAmount: 0,
      })
    ).toBeNull()
  })

  it('treats Seller ID blobs as junk names', () => {
    expect(looksLikeJunkSellerName('ID | 12964955')).toBe(true)
    expect(looksLikeJunkSellerName('!) | 12964955')).toBe(true)
    expect(looksLikeJunkSellerName('163/141 ซอยประชาอุทิศ11 แขวงดอนเมือง')).toBe(true)
    expect(looksLikeJunkSellerName('บริษัท ช้อปปี้ (ประเทศไทย) จำกัด')).toBe(false)
    expect(looksLikeJunkSellerName('find')).toBe(true)
    expect(looksLikeJunkSellerName('fad')).toBe(true)
    expect(looksLikeJunkSellerName('จนกว่า')).toBe(true)
    expect(looksLikeJunkSellerName('บริษัท จีดูบัง (เอเชีย) จำกัด')).toBe(false)
  })

  it('detects invoice copies to skip', () => {
    expect(isLikelyTaxInvoiceCopy('สำเนา')).toBe(true)
    expect(isLikelyTaxInvoiceCopy('True copy')).toBe(true)
    expect(isLikelyTaxInvoiceCopy('ต้นฉบับ')).toBe(false)
    expect(isLikelyTaxInvoiceCopy('สำเนา สำหรับวางบิล เลขที่ DCI-00-2607/0109')).toBe(false)
  })

  it('explains Buddhist year conversion', () => {
    expect(gregorianYmdToBuddhistHint('2026-07-01')).toContain('2569')
  })

  it('parses vision JSON invoices array and comma money', () => {
    const rows = parsePurchaseTaxInvoiceVisionPayload(`{
      "invoices": [
        {
          "docDate": "2569-07-01",
          "invoiceNo": "INV-20260524902",
          "sellerName": "บริษัท โพลาร์ แบร์ มิชชั่น จำกัด",
          "sellerTaxId": "010-5559-082-715",
          "sellerBranch": "สำนักงานใหญ่",
          "netAmount": "1,440.17",
          "vatAmount": "100.81",
          "isCopy": false
        }
      ]
    }`)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.docDate).toBe('2026-07-01')
    expect(rows[0]?.invoiceNo).toBe('INV-20260524902')
    expect(rows[0]?.sellerTaxId).toBe('0105559082715')
    expect(rows[0]?.netAmount).toBe(1440.17)
    expect(rows[0]?.vatAmount).toBe(100.81)
    expect(purchaseTaxInvoiceHasExtractedFields(rows[0]!)).toBe(true)
  })

  it('parses a single vision object and drops empty pages', () => {
    const one = parsePurchaseTaxInvoiceVisionPayload(
      '{"docDate":"2026-07-01","invoiceNo":"370010726W01098","sellerName":"Kasikorn","sellerTaxId":"0107536000315","netAmount":4.62,"vatAmount":0.32}'
    )
    expect(one[0]?.invoiceNo).toBe('370010726W01098')
    expect(parsePurchaseTaxInvoiceVisionPayload('{"invoices":[{}]}')).toEqual([])
    expect(parsePurchaseTaxInvoiceVisionPayload('not json')).toEqual([])
  })

  it('parses snake_case vision fields and a nested invoice object', () => {
    const rows = parsePurchaseTaxInvoiceVisionPayload(`{
      "invoice": {
        "invoice_no": "IV-9",
        "seller_name": "ABC Co",
        "seller_tax_id": "0105559082715",
        "net_amount": 100,
        "vat_amount": 7
      }
    }`)
    expect(rows[0]?.invoiceNo).toBe('IV-9')
    expect(rows[0]?.sellerName).toBe('ABC Co')
    expect(rows[0]?.sellerTaxId).toBe('0105559082715')
    expect(rows[0]?.netAmount).toBe(100)
    expect(rows[0]?.vatAmount).toBe(7)
  })
})

describe('purchase tax review flags', () => {
  it('flags VAT that is not 7% of net', () => {
    expect(purchaseTaxVatLooksWrong(100, 7)).toBe(false)
    expect(purchaseTaxVatLooksWrong(1440.17, 100.81)).toBe(false)
    expect(purchaseTaxVatLooksWrong(100, 20)).toBe(true)
    expect(purchaseTaxVatLooksWrong(100, 0)).toBe(false)
  })

  it('flags invoice month different from filing month', () => {
    expect(purchaseTaxDocMonthMismatch('2026-07-01', '2026-08')).toBe(true)
    expect(purchaseTaxDocMonthMismatch('2026-08-19', '2026-08')).toBe(false)
  })

  it('flags a 13-digit TIN with a bad checksum', () => {
    expect(
      purchaseTaxReviewFlags(
        { invoiceNo: 'A', sellerTaxId: '0105559082716', docDate: '2026-08-01', netAmount: 100, vatAmount: 7 },
        '2026-08'
      )
    ).toContain('tin')
    expect(
      purchaseTaxReviewFlags(
        { invoiceNo: 'A', sellerTaxId: '0105559082715', docDate: '2026-08-01', netAmount: 100, vatAmount: 7 },
        '2026-08'
      )
    ).not.toContain('tin')
  })

  it('treats incomplete TIN and empty invoice as problems, not skipped copies', () => {
    expect(purchaseTaxReviewIsProblem({ skip: true, invoiceNo: 'A', sellerTaxId: '0105559082715' }, '2026-08')).toBe(false)
    expect(
      purchaseTaxReviewIsProblem(
        { invoiceNo: 'A', sellerTaxId: '123', docDate: '2026-08-01', netAmount: 100, vatAmount: 7 },
        '2026-08'
      )
    ).toBe(true)
    expect(
      purchaseTaxReviewIsProblem(
        { invoiceNo: 'A', sellerTaxId: '0105559082715', docDate: '2026-08-01', netAmount: 100, vatAmount: 7 },
        '2026-08'
      )
    ).toBe(false)
    expect(
      purchaseTaxReviewIsProblem(
        { invoiceNo: 'IVT-1', sellerTaxId: '0105559082715', docDate: '2026-07-01', netAmount: 100, vatAmount: 7 },
        '2026-08'
      )
    ).toBe(false)
    expect(
      purchaseTaxReviewIsProblem(
        { invoiceNo: 'IVT-1', sellerTaxId: '0105559082715', docDate: '2026-07-01', netAmount: '', vatAmount: '' },
        '2026-08'
      )
    ).toBe(true)
    expect(
      purchaseTaxReviewIsProblem(
        { invoiceNo: '6907030', sellerTaxId: '0105550102497', docDate: '2026-07-02', netAmount: 0, vatAmount: 0 },
        '2026-07'
      )
    ).toBe(false)
    expect(
      purchaseTaxReviewFlags(
        { invoiceNo: 'IVT-1', sellerTaxId: '0105559082715', docDate: '2026-07-01', netAmount: 100, vatAmount: 7 },
        '2026-08'
      )
    ).toEqual(['month'])
    expect(
      purchaseTaxReviewIsProblem(
        { invoiceNo: '', sellerTaxId: '0105559082715', docDate: '2026-08-01', netAmount: 100, vatAmount: 7 },
        '2026-08'
      )
    ).toBe(true)
  })

  it('compares register VAT with PP.30 draft', () => {
    const r = purchaseTaxPp30Compare({
      registerVat: 100.81,
      reviewKeepVat: 7,
      pp30InputVat: 100.81,
      pp30OutputVat: 500,
    })
    expect(r.inSync).toBe(true)
    expect(r.afterSaveVat).toBe(107.81)
    expect(r.payableAfterReview).toBe(392.19)
  })
})
