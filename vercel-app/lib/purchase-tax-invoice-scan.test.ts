import { describe, expect, it } from 'vitest'
import {
  buildTaxInvoiceVisionUserPrompt,
  inferAmountsFromMoneySequence,
  mergePurchaseTaxInvoiceExtract,
  normalizeTaxInvoiceOcrText,
  parsePurchaseTaxInvoiceFromPdfText,
  parsePurchaseTaxInvoiceQrPayload,
  parseTaxInvoiceDateFromText,
  pdfPageTextLooksPrinted,
  purchaseTaxInvoiceTextExtractIsComplete,
  repairExtractedPurchaseTaxInvoice,
  extractPurchaseTaxInvoiceFromScanText,
  thaiTinChecksumOk,
} from './purchase-tax-invoice-scan'

const BUYER = '0105566137147'
const SELLER = '0105559082715'

describe('normalizeTaxInvoiceOcrText', () => {
  it('collapses spaced TIN digits', () => {
    expect(normalizeTaxInvoiceOcrText('TIN 010 5559 082 715 end')).toContain(SELLER)
  })

  it('detects printed PDF text vs empty scan', () => {
    expect(pdfPageTextLooksPrinted('hi')).toBe(false)
    expect(
      pdfPageTextLooksPrinted(
        'ใบกำกับภาษี เลขที่ INV-1 มูลค่าสินค้า 100.00 ภาษีมูลค่าเพิ่ม 7.00 รวมทั้งสิ้น 107.00 บริษัท ทดสอบ จำกัด'
      )
    ).toBe(true)
  })
})

describe('thaiTinChecksumOk', () => {
  it('accepts known 13-digit TINs', () => {
    expect(thaiTinChecksumOk(BUYER)).toBe(true)
    expect(thaiTinChecksumOk(SELLER)).toBe(true)
    expect(thaiTinChecksumOk('0107536000315')).toBe(true)
  })

  it('rejects a TIN with a bad check digit', () => {
    expect(thaiTinChecksumOk('0105559082716')).toBe(false)
    expect(thaiTinChecksumOk('123')).toBe(false)
  })
})

describe('parseTaxInvoiceDateFromText', () => {
  it('converts Buddhist dates', () => {
    expect(parseTaxInvoiceDateFromText('วันที่ 1/7/2569')).toBe('2026-07-01')
    expect(parseTaxInvoiceDateFromText('4 ส.ค. 2569')).toBe('2026-08-04')
  })
})

describe('parsePurchaseTaxInvoiceFromPdfText', () => {
  it('picks seller TIN not buyer TIN and reads totals', () => {
    const text = `
ใบกำกับภาษี / ใบเสร็จรับเงิน
บริษัท โพลาร์ แบร์ มิชชั่น จำกัด
เลขประจำตัวผู้เสียภาษีอากร 0105559082715
สำนักงานใหญ่
ผู้ซื้อ บริษัท 충만
เลขประจำตัวผู้เสียภาษีอากร 0105566137147
เลขที่ INV-20260524902
วันที่ 1 กรกฎาคม 2569
มูลค่าสินค้า 1,440.17
ภาษีมูลค่าเพิ่ม 100.81
รวมทั้งสิ้น 1,540.98
`
    const row = parsePurchaseTaxInvoiceFromPdfText(text, { buyerTaxId: BUYER, buyerName: '충만' })
    expect(row?.invoiceNo).toBe('INV-20260524902')
    expect(row?.sellerTaxId).toBe(SELLER)
    expect(row?.sellerName).toContain('โพลาร์')
    expect(row?.docDate).toBe('2026-07-01')
    expect(row?.netAmount).toBe(1440.17)
    expect(row?.vatAmount).toBe(100.81)
    expect(purchaseTaxInvoiceTextExtractIsComplete(row, { buyerTaxId: BUYER })).toBe(true)
  })

  it('reads hyphenated seller TIN', () => {
    const row = parsePurchaseTaxInvoiceFromPdfText(
      `ใบกำกับภาษี เลขประจำตัวผู้เสียภาษีอากร 010-5559-082-715 เลขที่ AB-99 มูลค่าสินค้า 100.00 ภาษีมูลค่าเพิ่ม 7.00`,
      { buyerTaxId: BUYER }
    )
    expect(row?.sellerTaxId).toBe(SELLER)
    expect(row?.invoiceNo).toBe('AB-99')
    expect(row?.netAmount).toBe(100)
  })
})

describe('repairExtractedPurchaseTaxInvoice', () => {
  it('drops buyer TIN mistakenly used as seller', () => {
    const repaired = repairExtractedPurchaseTaxInvoice(
      { invoiceNo: 'A', sellerTaxId: BUYER, netAmount: 100, vatAmount: 7 },
      { buyerTaxId: BUYER }
    )
    expect(repaired.sellerTaxId).toBeUndefined()
  })

  it('unwraps VAT-inclusive net when 7% matches the exclusive base', () => {
    const repaired = repairExtractedPurchaseTaxInvoice({
      invoiceNo: 'A',
      sellerTaxId: SELLER,
      netAmount: 107,
      vatAmount: 7,
    })
    expect(repaired.netAmount).toBe(100)
    expect(repaired.vatAmount).toBe(7)
    expect(repaired.totalAmount).toBe(107)
  })

  it('fills missing vat from total - net', () => {
    const repaired = repairExtractedPurchaseTaxInvoice({
      invoiceNo: 'A',
      netAmount: 100,
      totalAmount: 107,
    })
    expect(repaired.vatAmount).toBe(7)
  })
})

describe('mergePurchaseTaxInvoiceExtract', () => {
  it('fills vision gaps from PDF text', () => {
    const merged = mergePurchaseTaxInvoiceExtract(
      { invoiceNo: 'INV-1', sellerName: 'A Co', netAmount: 100 },
      { sellerTaxId: SELLER, vatAmount: 7, docDate: '2026-07-01' }
    )
    expect(merged?.invoiceNo).toBe('INV-1')
    expect(merged?.sellerTaxId).toBe(SELLER)
    expect(merged?.vatAmount).toBe(7)
    expect(merged?.docDate).toBe('2026-07-01')
  })
})

describe('inferAmountsFromMoneySequence', () => {
  it('picks net/vat/total when the last three amounts add up at 7%', () => {
    const inferred = inferAmountsFromMoneySequence('12.00 99.00 1,440.17 100.81 1,540.98')
    expect(inferred).toEqual({ netAmount: 1440.17, vatAmount: 100.81, totalAmount: 1540.98 })
  })
})

describe('parsePurchaseTaxInvoiceQrPayload', () => {
  it('reads pipe-separated seller TIN and amounts', () => {
    const row = parsePurchaseTaxInvoiceQrPayload(`${SELLER}|INV-88|100.00|7.00|107.00`)
    expect(row?.sellerTaxId).toBe(SELLER)
    expect(row?.invoiceNo).toBe('INV-88')
    expect(row?.netAmount).toBe(100)
    expect(row?.vatAmount).toBe(7)
  })
})

describe('extractPurchaseTaxInvoiceFromScanText', () => {
  it('uses QR block over noisy OCR labels', () => {
    const row = extractPurchaseTaxInvoiceFromScanText(
      `===QR===\n${SELLER}|AB-1|200.00|14.00|214.00\n===FULL===\ngarbage\n===TOTALS===\n200.00\n14.00\n214.00`,
      { buyerTaxId: BUYER }
    )
    expect(row?.sellerTaxId).toBe(SELLER)
    expect(row?.invoiceNo).toBe('AB-1')
    expect(row?.netAmount).toBe(200)
    expect(row?.vatAmount).toBe(14)
  })
})

describe('buildTaxInvoiceVisionUserPrompt', () => {
  it('tells the model the buyer TIN', () => {
    const p = buildTaxInvoiceVisionUserPrompt({ buyerTaxId: BUYER, pageText: 'เลขที่ INV-1 มูลค่า 100.00' })
    expect(p).toContain(BUYER)
    expect(p).toContain('INV-1')
  })
})
