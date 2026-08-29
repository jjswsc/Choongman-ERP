import { describe, expect, it } from 'vitest'
import {
  inferAmountsFromMoneySequence,
  pickExclusiveVatAmounts,
  joinPdfTextItemsByLine,
  mergePurchaseTaxInvoiceExtract,
  normalizeTaxInvoiceOcrText,
  parsePurchaseTaxInvoiceFromPdfText,
  parsePurchaseTaxInvoiceQrPayload,
  parseTaxInvoiceDateFromText,
  pdfPageTextLooksPrinted,
  pdfPageTextIsReliableForExtract,
  purchaseTaxInvoiceNeedsSparseOcr,
  purchaseTaxInvoiceScanFailI18nKey,
  purchaseTaxInvoiceTextExtractIsComplete,
  repairExtractedPurchaseTaxInvoice,
  extractPurchaseTaxInvoiceFromScanText,
  extractPurchaseTaxInvoicesFromScanText,
  fillSellerNameFromTinLookup,
  invoiceNoLooksPlausible,
  snapDocDateYearToTaxPeriod,
  splitScanTextIntoInvoiceBlocks,
  wrapTaxInvoiceQrText,
  thaiTinChecksumOk,
  tinsFromOcrDigitBlob,
} from './purchase-tax-invoice-scan'

const BUYER = '0105566137147'
const SELLER = '0105559082715'

describe('normalizeTaxInvoiceOcrText', () => {
  it('collapses spaced TIN digits', () => {
    expect(normalizeTaxInvoiceOcrText('TIN 010 5559 082 715 end')).toContain(SELLER)
  })

  it('maps Thai digits', () => {
    expect(normalizeTaxInvoiceOcrText('เลขที่ ๑๒๓๔๕๖๗๘')).toContain('12345678')
  })

  it('detects printed PDF text vs empty scan', () => {
    expect(pdfPageTextLooksPrinted('hi')).toBe(false)
    expect(
      pdfPageTextLooksPrinted(
        'ใบกำกับภาษี เลขที่ INV-1 มูลค่าสินค้า 100.00 ภาษีมูลค่าเพิ่ม 7.00 รวมทั้งสิ้น 107.00 บริษัท ทดสอบ จำกัด'
      )
    ).toBe(true)
  })

  it('does not treat a junk scan text layer as reliable', () => {
    expect(
      pdfPageTextIsReliableForExtract(
        'ใบกำกับภาษี เลขที่ ??? มูลค่าสินค้า abc ภาษีมูลค่าเพิ่ม xyz รวมทั้งสิ้น บริษัท ทดสอบ จำกัด extra padding text here'
      )
    ).toBe(false)
  })
})

describe('invoiceNoLooksPlausible', () => {
  it('rejects OCR titles and truncated numbers from July 2026 scans', () => {
    expect(invoiceNoLooksPlausible('TaxInvoice')).toBe(false)
    expect(invoiceNoLooksPlausible('TAXINVOICE')).toBe(false)
    expect(invoiceNoLooksPlausible('TAXINVOICE/DELIVERYORDER')).toBe(false)
    expect(invoiceNoLooksPlausible('PLZ')).toBe(false)
    expect(invoiceNoLooksPlausible('PLZBSHP024A')).toBe(false)
    expect(invoiceNoLooksPlausible('51')).toBe(false)
    expect(invoiceNoLooksPlausible('94')).toBe(false)
    expect(invoiceNoLooksPlausible('Hasan')).toBe(false)
    expect(invoiceNoLooksPlausible('ContactBcust')).toBe(false)
    expect(invoiceNoLooksPlausible('ontactBcuston')).toBe(false)
    expect(invoiceNoLooksPlausible('invpice/Taxrex')).toBe(false)
    expect(invoiceNoLooksPlausible('NX2026-07-0177')).toBe(true)
    expect(invoiceNoLooksPlausible('DCI-00-2607/0109')).toBe(true)
    expect(invoiceNoLooksPlausible('TITKBK008072026000010005')).toBe(true)
    expect(invoiceNoLooksPlausible('110510042902')).toBe(true)
    expect(invoiceNoLooksPlausible('IV 6907772')).toBe(true)
    expect(invoiceNoLooksPlausible('INV-20260531153')).toBe(true)
    expect(invoiceNoLooksPlausible('AB-99')).toBe(true)
    expect(invoiceNoLooksPlausible('IM20260701000087')).toBe(true)
    expect(invoiceNoLooksPlausible('010726E00037051')).toBe(true)
    expect(invoiceNoLooksPlausible('12345678')).toBe(true)
    expect(invoiceNoLooksPlausible('2607074')).toBe(true)
    expect(invoiceNoLooksPlausible('3763')).toBe(true)
    expect(invoiceNoLooksPlausible('51')).toBe(false)
    expect(invoiceNoLooksPlausible('GD-18-20')).toBe(false)
    expect(invoiceNoLooksPlausible('TRSPESPF00-')).toBe(false)
    expect(invoiceNoLooksPlausible('TRSPESPF00-00000-26')).toBe(false)
    expect(invoiceNoLooksPlausible('IM202607040')).toBe(false)
  })
})

describe('purchaseTaxInvoiceScanFailI18nKey', () => {
  it('maps local scan failures to copy keys', () => {
    expect(purchaseTaxInvoiceScanFailI18nKey('ocr_failed')).toBe('ptiOcrFailed')
    expect(purchaseTaxInvoiceScanFailI18nKey('empty_extract')).toBe('ptiPdfEmptyPage')
    expect(purchaseTaxInvoiceScanFailI18nKey('tesseract_createWorker_missing', 'ptiOcrFailed')).toBe('ptiOcrFailed')
    expect(purchaseTaxInvoiceScanFailI18nKey('pdf.js CDN load failed', 'ptiOcrFailed')).toBe('ptiOcrFailed')
    expect(purchaseTaxInvoiceScanFailI18nKey('ptiOcrFailed')).toBe('ptiOcrFailed')
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
    expect(parseTaxInvoiceDateFromText('Date : 2-Jul-26')).toBe('2026-07-02')
    expect(parseTaxInvoiceDateFromText('วันที่ 01/07/72026')).toBe('2026-07-01')
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
    expect(pdfPageTextIsReliableForExtract(text, { buyerTaxId: BUYER })).toBe(true)
  })

  it('runs sparse OCR when amounts are still missing even if invoice and TIN are present', () => {
    expect(
      purchaseTaxInvoiceNeedsSparseOcr(
        { invoiceNo: 'NX2026-07-0177', sellerTaxId: '0105561016821' },
        { buyerTaxId: BUYER }
      )
    ).toBe(true)
    expect(
      purchaseTaxInvoiceNeedsSparseOcr(
        { invoiceNo: 'NX2026-07-0177', sellerTaxId: '0105561016821', netAmount: 8320, vatAmount: 582.4 },
        { buyerTaxId: BUYER }
      )
    ).toBe(false)
    expect(
      purchaseTaxInvoiceNeedsSparseOcr(
        { invoiceNo: 'ContactBcust', sellerTaxId: '0105561016821', netAmount: 8320, vatAmount: 582.4 },
        { buyerTaxId: BUYER }
      )
    ).toBe(true)
    expect(purchaseTaxInvoiceNeedsSparseOcr({ invoiceNo: 'NX-1', netAmount: 100, vatAmount: 7 }, { buyerTaxId: BUYER })).toBe(
      true
    )
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

  it('drops a 13-digit TIN with a bad checksum', () => {
    const row = parsePurchaseTaxInvoiceFromPdfText(
      `ใบกำกับภาษี เลขประจำตัวผู้เสียภาษีอากร 0105559082716 เลขที่ AB-1 มูลค่าสินค้า 100.00 ภาษีมูลค่าเพิ่ม 7.00`
    )
    expect(row?.sellerTaxId).toBeUndefined()
    expect(row?.invoiceNo).toBe('AB-1')
    expect(row?.netAmount).toBe(100)
  })

  it('repairs a seller TIN that OCR read with O and l', () => {
    const row = parsePurchaseTaxInvoiceFromPdfText(
      `ใบกำกับภาษี เลขประจำตัวผู้เสียภาษีอากร O1055590827l5 เลขที่ AB-99 มูลค่าสินค้า 100.00 ภาษีมูลค่าเพิ่ม 7.00`,
      { buyerTaxId: BUYER }
    )
    expect(row?.sellerTaxId).toBe(SELLER)
    expect(row?.invoiceNo).toBe('AB-99')
  })

  it('collapses spaces in a labeled invoice number', () => {
    const row = parsePurchaseTaxInvoiceFromPdfText(
      `ใบกำกับภาษี เลขที่ INV - 88 เลขประจำตัวผู้เสียภาษีอากร ${SELLER} มูลค่าสินค้า 100.00 ภาษีมูลค่าเพิ่ม 7.00`,
      { buyerTaxId: BUYER }
    )
    expect(row?.invoiceNo).toBe('INV-88')
  })
})

describe('tinsFromOcrDigitBlob', () => {
  it('maps O and l into a checksum-valid TIN', () => {
    expect(tinsFromOcrDigitBlob('O1055590827l5')).toContain(SELLER)
  })

  it('does not invent a TIN by changing only the check digit', () => {
    expect(tinsFromOcrDigitBlob('0105559082716')).not.toContain(SELLER)
    expect(tinsFromOcrDigitBlob('0105559082716').some((tin) => thaiTinChecksumOk(tin))).toBe(false)
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

  it('drops a seller TIN with a bad checksum', () => {
    const repaired = repairExtractedPurchaseTaxInvoice({
      invoiceNo: 'A',
      sellerTaxId: '0105559082716',
      netAmount: 100,
      vatAmount: 7,
    })
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

  it('does not treat a 7% rate as 7 baht VAT', () => {
    const row = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี เลขที่ INV-88 เลขประจำตัวผู้เสียภาษีอากร ${SELLER} มูลค่าสินค้า 43.50 ภาษีมูลค่าเพิ่ม 7% รวมทั้งสิ้น 46.54`,
      { buyerTaxId: BUYER }
    )
    expect(row?.netAmount).toBe(43.5)
    expect(row?.vatAmount).toBe(3.04)
  })

  it('drops a VAT amount larger than net when 7% does not match', () => {
    const repaired = repairExtractedPurchaseTaxInvoice({
      invoiceNo: 'A',
      sellerTaxId: SELLER,
      netAmount: 374,
      vatAmount: 2623,
    })
    expect(repaired.netAmount).toBe(374)
    expect(repaired.vatAmount).toBeUndefined()
  })

  it('turns a 7% rate read as 7 baht into 7% of net', () => {
    const repaired = repairExtractedPurchaseTaxInvoice({
      invoiceNo: 'A',
      sellerTaxId: SELLER,
      netAmount: 374,
      vatAmount: 7,
    })
    expect(repaired.vatAmount).toBe(26.18)
  })

  it('fills net from VAT when supply is missing', () => {
    const repaired = repairExtractedPurchaseTaxInvoice(
      { invoiceNo: 'A', sellerTaxId: SELLER, vatAmount: 71.96 },
      { buyerTaxId: BUYER }
    )
    expect(repaired.netAmount).toBe(1028)
    expect(repaired.vatAmount).toBe(71.96)
  })

  it('repairs a line-item net that is not 7% of VAT', () => {
    const repaired = repairExtractedPurchaseTaxInvoice(
      { invoiceNo: 'INV-20260616066', sellerTaxId: SELLER, netAmount: 756, vatAmount: 6.41 },
      { buyerTaxId: BUYER, pageText: 'มูลค่า 756.00 ภาษีมูลค่าเพิ่ม 6.41 ค่าส่ง 91.59' }
    )
    expect(repaired.netAmount).toBe(91.59)
    expect(repaired.vatAmount).toBe(6.41)
  })

  it('does not leave net equal to VAT — reverse from 7%', () => {
    const repaired = repairExtractedPurchaseTaxInvoice(
      { invoiceNo: 'INV-20260616066', sellerTaxId: SELLER, netAmount: 6.41, vatAmount: 6.41 },
      { buyerTaxId: BUYER }
    )
    expect(repaired.netAmount).toBe(91.57)
    expect(repaired.vatAmount).toBe(6.41)
  })

  it('drops an invoice number that is just a slice of the seller TIN', () => {
    const repaired = repairExtractedPurchaseTaxInvoice({
      invoiceNo: '565002677',
      sellerTaxId: '0605565002677',
      netAmount: 100,
      vatAmount: 7,
    })
    expect(repaired.invoiceNo).toBeUndefined()
    expect(repaired.sellerTaxId).toBe('0605565002677')
  })

  it('does not invent a head-office branch just because the TIN is known', () => {
    const repaired = repairExtractedPurchaseTaxInvoice({
      invoiceNo: '02190129442',
      sellerTaxId: '0107567000414',
      sellerBranch: 'สาขา 00022',
      netAmount: 100,
      vatAmount: 7,
    })
    expect(repaired.sellerBranch).toBe('สาขา 00022')
    const noBranch = repairExtractedPurchaseTaxInvoice({
      invoiceNo: 'INV-1',
      sellerTaxId: SELLER,
      netAmount: 100,
      vatAmount: 7,
    })
    expect(noBranch.sellerBranch).toBeUndefined()
  })

  it('fills 7% VAT when the repeated page amount is already the supply but VAT is 0', () => {
    const repaired = repairExtractedPurchaseTaxInvoice(
      { invoiceNo: 'IM20260703020505', sellerTaxId: '0105556090377', netAmount: 1678.7, vatAmount: 0 },
      { buyerTaxId: BUYER, pageText: 'ใบกำกับภาษี\n1,678.70\n1,678.70\n1,678.70' }
    )
    expect(repaired.netAmount).toBe(1678.7)
    expect(repaired.vatAmount).toBe(117.51)
  })

  it('fills 7% VAT when supply is missing and the page repeats one amount', () => {
    const repaired = repairExtractedPurchaseTaxInvoice(
      { invoiceNo: 'IM20260709051887', sellerTaxId: '0105556090377' },
      {
        buyerTaxId: BUYER,
        pageText: 'ใบกำกับภาษี\n917.29\n917.29',
      }
    )
    expect(repaired.netAmount).toBe(917.29)
    expect(repaired.vatAmount).toBe(64.21)
  })

  it('replaces a 7% pair that is not on the page with the repeated page amount', () => {
    const repaired = repairExtractedPurchaseTaxInvoice(
      { invoiceNo: 'TRSPESPF00-00000-260702-017827', netAmount: 257.14, vatAmount: 18 },
      {
        buyerTaxId: BUYER,
        pageText: 'ใบกำกับภาษี Shopee\n137.05\n137.05',
      }
    )
    expect(repaired.netAmount).toBe(137.05)
    expect(repaired.vatAmount).toBe(9.59)
  })

  it('infers taxable net from shipping + service fee', () => {
    const inferred = inferAmountsFromMoneySequence(
      [
        'สินค้าเกษตรยกเว้น / TOTAL AMOUNT (VAT EXEMPTED ITEMS) 658.00',
        'ค่าจัดส่ง / SHIPPING COST 73.83',
        'ค่าบริการอื่น ๆ / SERVICE FEE 17.76',
        'ภาษีมูลค่าเพิ่ม / VAT 7% 6.41',
        'จำนวนเงินรวมทั้งสิ้น / SUBTOTAL 756.00',
      ].join('\n')
    )
    expect(inferred?.netAmount).toBe(91.59)
    expect(inferred?.vatAmount).toBe(6.41)
  })

  it('unwraps a VAT-inclusive printed total 1100 to 1028.04', () => {
    const repaired = repairExtractedPurchaseTaxInvoice({
      invoiceNo: '2607064',
      sellerTaxId: '0105550102497',
      netAmount: 1100,
      vatAmount: 71.96,
    })
    expect(repaired.netAmount).toBe(1028.04)
    expect(repaired.vatAmount).toBe(71.96)
  })

  it('drops a 1-baht supply that does not pass 7%', () => {
    const repaired = repairExtractedPurchaseTaxInvoice({ invoiceNo: 'A', netAmount: 1 })
    expect(repaired.netAmount).toBeUndefined()
  })

  it('snaps an OCR year that is a few years off the filing period', () => {
    expect(snapDocDateYearToTaxPeriod('2022-07-10', '2026-08')).toBe('2026-07-10')
    expect(snapDocDateYearToTaxPeriod('2026-07-10', '2026-08')).toBe('2026-07-10')
  })
})

describe('mergePurchaseTaxInvoiceExtract', () => {
  it('fills OCR gaps from PDF text', () => {
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

  it('uses net+total when VAT is missing and the difference is 7%', () => {
    const inferred = inferAmountsFromMoneySequence('1,148.36 1,148.36 48.36 1,228.74')
    expect(inferred).toEqual({ netAmount: 1148.36, vatAmount: 80.38, totalAmount: 1228.74 })
  })

  it('does not treat a larger figure whose 7% equals the real net as the supply amount', () => {
    expect(pickExclusiveVatAmounts([19002.43, 1330.17, 1423.28])).toEqual({
      netAmount: 1330.17,
      vatAmount: 93.11,
      totalAmount: 1423.28,
    })
  })
})

describe('withholding and exempt lines', () => {
  it('does not use หัก ณ ที่จ่าย as VAT', () => {
    const row = extractPurchaseTaxInvoiceFromScanText(
      [
        'ใบกำกับภาษี เลขที่ INV2026070017',
        'เลขประจำตัวผู้เสียภาษี 0105562090693',
        'มูลค่าสินค้า 10,411.22',
        'หัก ณ ที่จ่าย 312.34',
        'ภาษีมูลค่าเพิ่ม 728.79',
        'รวมทั้งสิ้น 11,140.01',
      ].join('\n'),
      { buyerTaxId: BUYER }
    )
    expect(row?.invoiceNo).toBe('INV2026070017')
    expect(row?.netAmount).toBe(10411.22)
    expect(row?.vatAmount).toBe(728.79)
  })

  it('ignores exempt produce when repairing Polar Bear 7% net', () => {
    const inferred = inferAmountsFromMoneySequence(
      'สินค้าเกษตรยกเว้น 658.00\n756.00\n6.41\n91.59'
    )
    expect(inferred?.netAmount).toBe(91.59)
    expect(inferred?.vatAmount).toBe(6.41)
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

  it('reads query params from an e-tax URL', () => {
    const row = parsePurchaseTaxInvoiceQrPayload(
      `https://service.rd.go.th/check?sellerTin=${SELLER}&invoiceNo=AB-9&netAmount=100.00&vatAmount=7.00`
    )
    expect(row?.sellerTaxId).toBe(SELLER)
    expect(row?.invoiceNo).toBe('AB-9')
    expect(row?.netAmount).toBe(100)
    expect(row?.vatAmount).toBe(7)
  })
})

describe('joinPdfTextItemsByLine', () => {
  it('keeps มูลค่า and the amount on the same line', () => {
    const text = joinPdfTextItemsByLine([
      { str: 'มูลค่า', transform: [1, 0, 0, 1, 10, 200] },
      { str: '1,440.17', transform: [1, 0, 0, 1, 120, 200] },
      { str: 'VAT', transform: [1, 0, 0, 1, 10, 180] },
      { str: '100.81', transform: [1, 0, 0, 1, 120, 180] },
    ])
    expect(text).toContain('มูลค่า 1,440.17')
    expect(text).toContain('VAT 100.81')
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

  it('reads a URL that is not wrapped in ===QR===', () => {
    const row = extractPurchaseTaxInvoiceFromScanText(
      `garbage\nhttps://rd.go.th/e?sellerTin=${SELLER}&invoiceNo=ZX-2&netAmount=50.00&vatAmount=3.50\n`,
      { buyerTaxId: BUYER }
    )
    expect(row?.sellerTaxId).toBe(SELLER)
    expect(row?.invoiceNo).toBe('ZX-2')
    expect(row?.netAmount).toBe(50)
  })

  it('prefers TOTALS_DIGITS amounts over garbled Thai TOTALS', () => {
    const row = extractPurchaseTaxInvoiceFromScanText(
      `===FULL===\nเลขที่ INV-9\n===TOTALS===\nxxx yyy zzz\n===TOTALS_DIGITS===\n100.00\n7.00\n107.00`,
      { buyerTaxId: BUYER }
    )
    expect(row?.invoiceNo).toBe('INV-9')
    expect(row?.netAmount).toBe(100)
    expect(row?.vatAmount).toBe(7)
  })

  it('lets QR overwrite a wrong invoice number in the text layer', () => {
    const row = extractPurchaseTaxInvoiceFromScanText(
      `===QR===\n${SELLER}|RIGHT-1|50.00|3.50|53.50\n===FULL===\nใบกำกับภาษี เลขที่ WRONG-9 มูลค่าสินค้า 1.00 ภาษีมูลค่าเพิ่ม 0.07`,
      { buyerTaxId: BUYER }
    )
    expect(row?.invoiceNo).toBe('RIGHT-1')
    expect(row?.sellerTaxId).toBe(SELLER)
    expect(row?.netAmount).toBe(50)
  })
})

describe('fillSellerNameFromTinLookup', () => {
  it('fills seller name from a known TIN', () => {
    const filled = fillSellerNameFromTinLookup(
      { sellerTaxId: SELLER, invoiceNo: 'A', netAmount: 100 },
      [{ sellerTaxId: SELLER, sellerName: 'บริษัท ตัวอย่าง จำกัด' }]
    )
    expect(filled.sellerName).toContain('ตัวอย่าง')
  })

  it('does not overwrite an existing seller name', () => {
    const filled = fillSellerNameFromTinLookup(
      { sellerTaxId: SELLER, sellerName: 'Keep Me', invoiceNo: 'A' },
      [{ sellerTaxId: SELLER, sellerName: 'Other' }]
    )
    expect(filled.sellerName).toBe('Keep Me')
  })

  it('replaces a junk OCR seller name from TIN lookup', () => {
    const filled = fillSellerNameFromTinLookup(
      { sellerTaxId: SELLER, sellerName: 'find', invoiceNo: 'A' },
      [{ sellerTaxId: SELLER, sellerName: 'บริษัท โพลาร์ แบร์ มิชชั่น จำกัด' }]
    )
    expect(filled.sellerName).toContain('โพลาร์')
  })
})

const OTHER = '0107536000315'

describe('splitScanTextIntoInvoiceBlocks', () => {
  it('splits two unique QR payloads into two invoices', () => {
    const text = wrapTaxInvoiceQrText([`${SELLER}|TOP-1|100.00|7.00|107.00`, `${OTHER}|BOT-2|200.00|14.00|214.00`])
    const blocks = splitScanTextIntoInvoiceBlocks(text)
    expect(blocks).toHaveLength(2)
    const rows = extractPurchaseTaxInvoicesFromScanText(text, { buyerTaxId: BUYER })
    expect(rows.map((r) => r.invoiceNo).sort()).toEqual(['BOT-2', 'TOP-1'])
    expect(rows.map((r) => r.sellerTaxId).sort()).toEqual([OTHER, SELLER].sort())
  })

  it('splits two ใบกำกับภาษี markers on one page', () => {
    const top = `ใบกำกับภาษี ต้นฉบับ\nเลขที่ A-1\nเลขประจำตัวผู้เสียภาษีอากร ${SELLER}\nมูลค่าสินค้า 100.00\nภาษีมูลค่าเพิ่ม 7.00\nรวมทั้งสิ้น 107.00\n${'x'.repeat(80)}\n`
    const bot = `ใบกำกับภาษี ต้นฉบับ\nเลขที่ B-2\nเลขประจำตัวผู้เสียภาษีอากร ${OTHER}\nมูลค่าสินค้า 50.00\nภาษีมูลค่าเพิ่ม 3.50\nรวมทั้งสิ้น 53.50`
    const rows = extractPurchaseTaxInvoicesFromScanText(top + bot, { buyerTaxId: BUYER })
    expect(rows.map((r) => r.invoiceNo).sort()).toEqual(['A-1', 'B-2'])
  })

  it('does not split two QRs of the same invoice', () => {
    const text = wrapTaxInvoiceQrText([
      `${SELLER}|INV-88|100.00|7.00|107.00`,
      `${SELLER}|INV-88|100.00|7.00|107.00`,
    ])
    expect(splitScanTextIntoInvoiceBlocks(text)).toHaveLength(1)
    expect(extractPurchaseTaxInvoicesFromScanText(text, { buyerTaxId: BUYER })).toHaveLength(1)
  })

  it('does not split one invoice that repeats ใบกำกับภาษี', () => {
    const text = `ใบกำกับภาษี / ใบเสร็จรับเงิน
เลขที่ ONLY-1
เลขประจำตัวผู้เสียภาษีอากร ${SELLER}
มูลค่าสินค้า 100.00
ภาษีมูลค่าเพิ่ม 7.00
รวมทั้งสิ้น 107.00
${'padding '.repeat(30)}
สำเนาใบกำกับภาษี ONLY-1`
    expect(splitScanTextIntoInvoiceBlocks(text)).toHaveLength(1)
    expect(extractPurchaseTaxInvoicesFromScanText(text, { buyerTaxId: BUYER })).toHaveLength(1)
  })
})
