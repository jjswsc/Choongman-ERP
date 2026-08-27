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
  it('reads Shopee / Grab / Kasikorn invoice numbers used in July 2026 buy VAT', () => {
    const shopee = extractPurchaseTaxInvoiceFromScanText(
      [
        'Seller ID | 12964955',
        'เลขที่ TRSPESPF00-00000-260701-004099',
        'เลขประจำตัวผู้เสียภาษี 0105558019588',
        'มูลค่าสินค้า 43.50',
        'ภาษีมูลค่าเพิ่ม 3.04',
        'รวมทั้งสิ้น 46.54',
      ].join('\n'),
      { buyerTaxId: BUYER }
    )
    expect(shopee?.invoiceNo).toBe('TRSPESPF00-00000-260701-004099')
    expect(shopee?.sellerTaxId).toBe('0105558019581')
    expect(shopee?.sellerName).toContain('ช้อปปี้')
    expect(shopee?.docDate).toBe('2026-07-01')
    expect(shopee?.netAmount).toBe(43.5)

    const grab = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี เลขที่ IM20260701000087\nบริษัท แกร็บแท็กซี่ (ประเทศไทย) จำกัด\nเลขประจำตัวผู้เสียภาษี 0105556090377\nมูลค่า 337.16 ภาษีมูลค่าเพิ่ม 23.60 รวมทั้งสิ้น 360.76`,
      { buyerTaxId: BUYER }
    )
    expect(grab?.invoiceNo).toBe('IM20260701000087')
    expect(grab?.sellerTaxId).toBe('0105556090377')
    expect(grab?.docDate).toBe('2026-07-01')
    expect(grab?.netAmount).toBe(337.16)

    const grabNoPrefix = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี บริษัท เอเชีย คอมเมิร์ซ แอนด์ เทรด จำกัด\nเลขประจำตัวผู้เสียภาษี 0105556090377\n20260701000087\nมูลค่า 337.16 ภาษีมูลค่าเพิ่ม 23.60 รวมทั้งสิ้น 360.76`,
      { buyerTaxId: BUYER }
    )
    expect(grabNoPrefix?.invoiceNo).toBe('IM20260701000087')
    expect(grabNoPrefix?.sellerName).toContain('แกร็บ')

    const junkTitle = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี Tax Invoice\nเลขที่ TAXINVOICE\nเลขประจำตัวผู้เสียภาษี 0107536000315\n010726E00037051\nมูลค่า 65.72 ภาษีมูลค่าเพิ่ม 4.60`,
      { buyerTaxId: BUYER }
    )
    expect(junkTitle?.invoiceNo).toBe('010726E00037051')
    expect(junkTitle?.sellerName).toContain('กสิกร')

    const kbank = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี เลขที่ 010726E00037051\nบริษัท ธนาคารกสิกรไทย จำกัด (มหาชน)\nเลขประจำตัวผู้เสียภาษี 0107536000315\nมูลค่า 65.72 ภาษีมูลค่าเพิ่ม 4.60 รวมทั้งสิ้น 70.32`,
      { buyerTaxId: BUYER }
    )
    expect(kbank?.invoiceNo).toBe('010726E00037051')
    expect(kbank?.sellerTaxId).toBe('0107536000315')
    expect(kbank?.docDate).toBe('2026-07-01')
  })

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
