import { describe, expect, it } from 'vitest'
import {
  extractPurchaseTaxInvoiceFromScanText,
  parsePurchaseTaxInvoiceFromPdfText,
  purchaseTaxInvoiceTextExtractIsComplete,
  wrapTaxInvoiceQrText,
} from './purchase-tax-invoice-scan'

const BUYER = '0105566137147'
const SELLER = '0105559082715'

const POLAR_BEAR_PRINTED = `
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

describe('purchase tax invoice golden texts', () => {
  it('reads an electronic PDF text layer (Polar Bear style)', () => {
    const row = parsePurchaseTaxInvoiceFromPdfText(POLAR_BEAR_PRINTED, { buyerTaxId: BUYER, buyerName: '충만' })
    expect(row?.invoiceNo).toBe('INV-20260524902')
    expect(row?.sellerTaxId).toBe(SELLER)
    expect(row?.sellerName).toContain('โพลาร์')
    expect(row?.docDate).toBe('2026-07-01')
    expect(row?.netAmount).toBe(1440.17)
    expect(row?.vatAmount).toBe(100.81)
    expect(purchaseTaxInvoiceTextExtractIsComplete(row, { buyerTaxId: BUYER })).toBe(true)
  })

  it('reads a noisy OCR page when QR and TOTALS_DIGITS are present', () => {
    const text = [
      wrapTaxInvoiceQrText(`${SELLER}|INV-88|100.00|7.00|107.00`),
      '===FULL===',
      'l1@v kxx TIN 0l055590827l5 garbage',
      '===TOTALS===',
      'xxx yyy รวม',
      '===TOTALS_DIGITS===',
      '100.00',
      '7.00',
      '107.00',
    ].join('\n')
    const row = extractPurchaseTaxInvoiceFromScanText(text, { buyerTaxId: BUYER })
    expect(row?.sellerTaxId).toBe(SELLER)
    expect(row?.invoiceNo).toBe('INV-88')
    expect(row?.netAmount).toBe(100)
    expect(row?.vatAmount).toBe(7)
  })

  it('prefers TOTALS_DIGITS over garbled Thai totals without QR', () => {
    const row = extractPurchaseTaxInvoiceFromScanText(
      `===FULL===\nเลขที่ SCAN-3\nเลขประจำตัวผู้เสียภาษีอากร ${SELLER}\n===TOTALS===\nxxx yyy zzz\n===TOTALS_DIGITS===\n1,440.17\n100.81\n1,540.98`,
      { buyerTaxId: BUYER }
    )
    expect(row?.invoiceNo).toBe('SCAN-3')
    expect(row?.sellerTaxId).toBe(SELLER)
    expect(row?.netAmount).toBe(1440.17)
    expect(row?.vatAmount).toBe(100.81)
  })
})
