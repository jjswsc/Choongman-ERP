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

    const grabWrongYearRef = extractPurchaseTaxInvoiceFromScanText(
      `THMG20230716150023017236\nเลขที่ 420260702033636\nเลขประจำตัวผู้เสียภาษี 0105556090377\nมูลค่า 819.19 ภาษีมูลค่าเพิ่ม 57.34`,
      { buyerTaxId: BUYER, taxMonth: '2026-07' }
    )
    expect(grabWrongYearRef?.invoiceNo).toBe('IM20260702033636')

    const grabBang = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี เลขที่ IM2026070100008!\nเลขประจำตัวผู้เสียภาษี 0105556090377\nมูลค่า 337.16 ภาษีมูลค่าเพิ่ม 23.60`,
      { buyerTaxId: BUYER }
    )
    expect(grabBang?.invoiceNo).toBe('IM20260701000081')
    expect(grabBang?.sellerBranch).toBe('สำนักงานใหญ่')
  })

  it('recovers July 2026 25040 invoice numbers that OCR truncates or splits', () => {
    const shopeeExtraDay = extractPurchaseTaxInvoiceFromScanText(
      `เลขที่ TRSPESPF00-00000-260708-01824008\nเลขประจำตัวผู้เสียภาษี 0105558019581\nมูลค่า 391.23 ภาษีมูลค่าเพิ่ม 27.39`,
      { buyerTaxId: BUYER, taxMonth: '2026-07' }
    )
    expect(shopeeExtraDay?.invoiceNo).toBe('TRSPESPF00-00000-260708-018240')

    const shopeeHeadOnly = extractPurchaseTaxInvoiceFromScanText(
      [
        'เลขที่/ No. | TRSPESPF00-00000-',
        'ที่อยู่/ Address           เลขที่ 54                        0701-017862',
        'เลขประจำตัวผู้เสียภาษี 0105558019581',
        'มูลค่าสินค้า 218.34',
        'ภาษีมูลค่าเพิ่ม 15.28',
      ].join('\n'),
      { buyerTaxId: BUYER, taxMonth: '2026-07' }
    )
    expect(shopeeHeadOnly?.invoiceNo).toBe('TRSPESPF00-00000-260701-017862')
    expect(shopeeHeadOnly?.netAmount).toBe(218.34)

    const shopeeThaiSplit = extractPurchaseTaxInvoiceFromScanText(
      [
        'เลขที่/ No. | TRSPESPF00-00000-26',
        'ที่อยู่/ Address           เลขที่ 54 อาคารศูนย์การค้ายูเนี่ยนมอลล์ ห้องเลขที่ 60                        0701-017862',
        '19-20 ขั้นที่ F-G',
        'เลขประจำตัวผู้เสียภาษี 0105558019581',
        'มูลค่าสินค้า 218.34',
        'ภาษีมูลค่าเพิ่ม 15.28',
        'รวมทั้งสิ้น 233.62',
      ].join('\n'),
      { buyerTaxId: BUYER }
    )
    expect(shopeeThaiSplit?.invoiceNo).toBe('TRSPESPF00-00000-260701-017862')
    expect(shopeeThaiSplit?.netAmount).toBe(218.34)

    const shopeeSplit = extractPurchaseTaxInvoiceFromScanText(
      `เลขที่ TRSPESPF00-\n00000-260701-017862\nเลขประจำตัวผู้เสียภาษี 0105558019581\nมูลค่าสินค้า 218.34\nภาษีมูลค่าเพิ่ม 15.28\nรวมทั้งสิ้น 233.62`,
      { buyerTaxId: BUYER }
    )
    expect(shopeeSplit?.invoiceNo).toBe('TRSPESPF00-00000-260701-017862')
    expect(shopeeSplit?.sellerTaxId).toBe('0105558019581')
    expect(shopeeSplit?.netAmount).toBe(218.34)

    const shopeeOcrC = extractPurchaseTaxInvoiceFromScanText(
      `เลขที่ TRSPESPF0C-00000-260728-017950\nเลขประจำตัวผู้เสียภาษี 0105558019581\nมูลค่า 442.62 ภาษีมูลค่าเพิ่ม 30.98`,
      { buyerTaxId: BUYER }
    )
    expect(shopeeOcrC?.invoiceNo).toBe('TRSPESPF00-00000-260728-017950')

    const grabSplit = extractPurchaseTaxInvoiceFromScanText(
      `เลขที่ IM20260704039284\nบริษัท แกร็บแท็กซี่ (ประเทศไทย) จำกัด\nเลขประจำตัวผู้เสียภาษี 0105556090377\nมูลค่า 1,148.36 ภาษีมูลค่าเพิ่ม 80.38 รวมทั้งสิ้น 1,228.74`,
      { buyerTaxId: BUYER }
    )
    expect(grabSplit?.invoiceNo).toBe('IM20260704039284')

    const grabDigitsOnly = extractPurchaseTaxInvoiceFromScanText(
      `IM202607040\n39284\nเลขประจำตัวผู้เสียภาษี 0105556090377\nมูลค่า 1,148.36 ภาษีมูลค่าเพิ่ม 80.38`,
      { buyerTaxId: BUYER }
    )
    expect(grabDigitsOnly?.invoiceNo).toBe('IM20260704039284')

    const kbankF = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี เลขที่ 220726F00021905\nบริษัท ธนาคารกสิกรไทย จำกัด (มหาชน)\nเลขประจำตัวผู้เสียภาษี 0107536000315\nมูลค่า 65.85 ภาษีมูลค่าเพิ่ม 4.61`,
      { buyerTaxId: BUYER }
    )
    expect(kbankF?.invoiceNo).toBe('220726F00021905')
    expect(kbankF?.sellerTaxId).toBe('0107536000315')
    expect(kbankF?.docDate).toBe('2026-07-22')

    const junkGd = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี เลขที่ GD-18-20\n010726E00021480\nเลขประจำตัวผู้เสียภาษี 0107536000315\nมูลค่า 146.36 ภาษีมูลค่าเพิ่ม 10.25`,
      { buyerTaxId: BUYER }
    )
    expect(junkGd?.invoiceNo).toBe('010726E00021480')

    const jidubangEnDate = extractPurchaseTaxInvoiceFromScanText(
      `TAX INVOICE\nJIDUBANG (ASIA) CO., LTD.\nเลขประจำตัวผู้เสียภาษี 0105550102497\nเลขที่ 2607074\nDate : 2-Jul-26\nมูลค่า 9,850.47\nภาษีมูลค่าเพิ่ม 689.53\nรวมทั้งสิ้น 10,540.00`,
      { buyerTaxId: BUYER, taxMonth: '2026-07' }
    )
    expect(jidubangEnDate?.docDate).toBe('2026-07-02')
    expect(jidubangEnDate?.netAmount).toBe(9850.47)

    const jidubang = extractPurchaseTaxInvoiceFromScanText(
      `TAX INVOICE\nJIDUBANG (ASIA) CO., LTD.\nเลขประจำตัวผู้เสียภาษี 0105550102497\nเลขที่ 2607074\nวันที่ 02/07/2026\nมูลค่า 9,850.47\nภาษีมูลค่าเพิ่ม 689.53\nรวมทั้งสิ้น 10,540.00`,
      { buyerTaxId: BUYER }
    )
    expect(jidubang?.invoiceNo).toBe('2607074')
    expect(jidubang?.sellerTaxId).toBe('0105550102497')
    expect(jidubang?.sellerName).toBe('บริษัท จีดูบัง (เอเชีย) จำกัด')
    expect(jidubang?.netAmount).toBe(9850.47)

    const jidubangExempt = extractPurchaseTaxInvoiceFromScanText(
      `เลขที่ 6907030\nเลขประจำตัวผู้เสียภาษี 0105550102497\nมูลค่าสินค้า 0.00 ภาษีมูลค่าเพิ่ม 0.00 รวมทั้งสิ้น 330.00`,
      { buyerTaxId: BUYER }
    )
    expect(jidubangExempt?.invoiceNo).toBe('6907030')
    expect(jidubangExempt?.sellerTaxId).toBe('0105550102497')
    expect(jidubangExempt?.sellerName).toBe('บริษัท จีดูบัง (เอเชีย) จำกัด')
    expect(jidubangExempt?.netAmount).toBe(0)
    expect(jidubangExempt?.vatAmount).toBe(0)

    const tinAsInvoice = extractPurchaseTaxInvoiceFromScanText(
      `เลขที่ 0105558019581\nTRSPESPF00-00000-260702-017827\nมูลค่า 137.05 ภาษีมูลค่าเพิ่ม 9.59`,
      { buyerTaxId: BUYER }
    )
    expect(tinAsInvoice?.invoiceNo).toBe('TRSPESPF00-00000-260702-017827')
    expect(tinAsInvoice?.sellerTaxId).toBe('0105558019581')
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

/** S&J ก.ค. 2569 사무실 공급사 35건 — 합성 글자층. OneDrive xlsx는 커밋하지 않음. */
const SJ_JUL2026: Array<{
  invoiceNo: string
  expectNo: string
  tin: string
  name: string
  net: number
  vat: number
  date: string
  extra?: string
}> = [
  { invoiceNo: 'IVT-69070062', expectNo: 'IVT-69070062', tin: '0105533116116', name: 'จี.ซี.เอส', net: 3200, vat: 224, date: '01/07/2569' },
  { invoiceNo: '2607064', expectNo: '2607064', tin: '0105550102497', name: 'จีดูบัง', net: 1028.04, vat: 71.96, date: '01/07/2569', extra: 'มูลค่าสินค้า 1,100.00\nภาษีมูลค่าเพิ่ม 71.96\nรวมทั้งสิ้น 1,100.00' },
  { invoiceNo: '69070034', expectNo: '69070034', tin: '0605565002677', name: 'เคลฟเวอร์', net: 231141.61, vat: 16179.91, date: '02/07/2569' },
  { invoiceNo: 'NX2026-07-0177', expectNo: 'NX2026-07-0177', tin: '0105561016821', name: 'โปโลเน็กซ์', net: 8320, vat: 582.4, date: '02/07/2569' },
  { invoiceNo: '110510042902', expectNo: '110510042902', tin: '0107561000374', name: 'อาร์ แอนด์ บี', net: 124000, vat: 8680, date: '05/07/2569' },
  { invoiceNo: 'NC2026070045', expectNo: 'NC2026070045', tin: '0105563175048', name: 'ไนซ์ชอยซ์', net: 65420.56, vat: 4579.44, date: '06/07/2569', extra: 'มูลค่าสินค้า 70,000.00\nภาษีมูลค่าเพิ่ม 4,579.44\nรวมทั้งสิ้น 70,000.00' },
  { invoiceNo: 'IV-016057', expectNo: 'IV-016057', tin: '0105552129309', name: 'ไอ สไตล์', net: 3360, vat: 235.2, date: '06/07/2569' },
  { invoiceNo: 'TITKBK008072026000010005', expectNo: 'TITKBK008072026000010005', tin: '0105549025026', name: 'ทรู อินเทอร์เน็ต', net: 799, vat: 55.93, date: '07/07/2569' },
  { invoiceNo: '16070819', expectNo: '16070819', tin: '0105560133760', name: 'ทรู ดิจิทัล พาร์ค', net: 1500, vat: 105, date: '08/07/2569', extra: 'สาขา 00001' },
  { invoiceNo: 'RV269070486', expectNo: 'RV269070486', tin: '0105550095270', name: 'นายทำถูก', net: 4200, vat: 294, date: '09/07/2569' },
  { invoiceNo: 'IV 6907772', expectNo: 'IV6907772', tin: '0115559009368', name: 'วันไลฟ์', net: 11290, vat: 790.3, date: '09/07/2569' },
  { invoiceNo: 'IV 6907773', expectNo: 'IV6907773', tin: '0115559009368', name: 'วันไลฟ์', net: 20100, vat: 1407, date: '09/07/2569' },
  { invoiceNo: '69070138', expectNo: '69070138', tin: '0605565002677', name: 'เคลฟเวอร์', net: 229124.17, vat: 16038.69, date: '12/07/2569' },
  { invoiceNo: '16070493', expectNo: '16070493', tin: '0105560133760', name: 'ทรู ดิจิทัล พาร์ค', net: 600, vat: 42, date: '13/07/2569', extra: 'สาขา 00001' },
  { invoiceNo: '16070492', expectNo: '16070492', tin: '0105560133760', name: 'ทรู ดิจิทัล พาร์ค', net: 600, vat: 42, date: '13/07/2569', extra: 'สาขา 00001' },
  { invoiceNo: '16070504', expectNo: '16070504', tin: '0105560133760', name: 'ทรู ดิจิทัล พาร์ค', net: 55000, vat: 3850, date: '13/07/2569', extra: 'สาขา 00001' },
  { invoiceNo: 'NX2026-07-0192', expectNo: 'NX2026-07-0192', tin: '0105561016821', name: 'โปโลเน็กซ์', net: 373.83, vat: 26.17, date: '15/07/2569', extra: 'มูลค่าสินค้า 400.00\nภาษีมูลค่าเพิ่ม 26.17\nรวมทั้งสิ้น 400.00' },
  { invoiceNo: 'RV269070770', expectNo: 'RV269070770', tin: '0105550095270', name: 'นายทำถูก', net: 4200, vat: 294, date: '15/07/2569' },
  { invoiceNo: '110510043070', expectNo: '110510043070', tin: '0107561000374', name: 'อาร์ แอนด์ บี', net: 62000, vat: 4340, date: '16/07/2569' },
  { invoiceNo: '110510043075', expectNo: '110510043075', tin: '0107561000374', name: 'อาร์ แอนด์ บี', net: 62000, vat: 4340, date: '17/07/2569' },
  { invoiceNo: 'DCI-00-2607/0109', expectNo: 'DCI-00-2607/0109', tin: '0105544080525', name: 'แสงเจริญพริ้นต์', net: 98000, vat: 6860, date: '19/07/2569', extra: 'สำหรับวางบิล' },
  { invoiceNo: 'DOI-00-2607/0103', expectNo: 'DOI-00-2607/0103', tin: '0105544080525', name: 'แสงเจริญพริ้นต์', net: 98000, vat: 6860, date: '19/07/2569', extra: 'ต้นฉบับ' },
  { invoiceNo: 'IV-016119', expectNo: 'IV-016119', tin: '0105552129309', name: 'ไอ สไตล์', net: 3360, vat: 235.2, date: '20/07/2569' },
  { invoiceNo: '110510043098', expectNo: '110510043098', tin: '0107561000374', name: 'อาร์ แอนด์ บี', net: 62000, vat: 4340, date: '20/07/2569' },
  { invoiceNo: 'INV2026070017', expectNo: 'INV2026070017', tin: '0105562090693', name: 'มอร์แดนบรีท', net: 10411.22, vat: 728.79, date: '22/07/2569' },
  { invoiceNo: 'NC2026070120', expectNo: 'NC2026070120', tin: '0105563175048', name: 'ไนซ์ชอยซ์', net: 13906.54, vat: 973.46, date: '23/07/2569', extra: 'มูลค่าสินค้า 14,880.00\nภาษีมูลค่าเพิ่ม 973.46\nรวมทั้งสิ้น 14,880.00' },
  { invoiceNo: 'SI2607065123', expectNo: 'SI2607065123', tin: '0105537143215', name: 'ออฟฟิศเมท', net: 1306.34, vat: 91.44, date: '26/07/2569' },
  { invoiceNo: 'INV-20260592999', expectNo: 'INV-20260592999', tin: '0105559082715', name: 'โพลาร์ แบร์', net: 137.37, vat: 9.62, date: '22/07/2569' },
  { invoiceNo: 'INV-20260592998', expectNo: 'INV-20260592998', tin: '0105559082715', name: 'โพลาร์ แบร์', net: 1428.96, vat: 100.03, date: '22/07/2569' },
  { invoiceNo: 'INV-20260616066', expectNo: 'INV-20260616066', tin: '0105559082715', name: 'โพลาร์ แบร์', net: 91.59, vat: 6.41, date: '29/07/2569', extra: 'สินค้าเกษตรยกเว้น 658.00\nมูลค่าสินค้า 756.00\nภาษีมูลค่าเพิ่ม 6.41\nค่าส่ง 91.59' },
  { invoiceNo: '69070361', expectNo: '69070361', tin: '0605565002677', name: 'เคลฟเวอร์', net: 204552.97, vat: 14318.71, date: '29/07/2569' },
  { invoiceNo: '69070362', expectNo: '69070362', tin: '0605565002677', name: 'เคลฟเวอร์', net: 23775.7, vat: 1664.3, date: '29/07/2569', extra: 'มูลค่าสินค้า 25,440.00\nภาษีมูลค่าเพิ่ม 1,664.30\nรวมทั้งสิ้น 25,440.00' },
  { invoiceNo: 'INV-20260616039', expectNo: 'INV-20260616039', tin: '0105559082715', name: 'โพลาร์ แบร์', net: 1162.63, vat: 81.38, date: '29/07/2569' },
  { invoiceNo: 'IV-016163', expectNo: 'IV-016163', tin: '0105552129309', name: 'ไอ สไตล์', net: 10080, vat: 705.6, date: '30/07/2569' },
  { invoiceNo: 'CS69070099', expectNo: 'CS69070099', tin: '0105555033892', name: 'บราเทอร์เจ', net: 6128, vat: 428.96, date: '30/07/2569' },
]

function money2(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

describe('S&J July 2026 office supplier goldens', () => {
  it('has 35 unique invoices', () => {
    expect(SJ_JUL2026).toHaveLength(35)
    expect(new Set(SJ_JUL2026.map((r) => r.expectNo)).size).toBe(35)
  })

  it('reads each S&J invoice number, TIN, Thai name, and 7% amounts', () => {
    for (const row of SJ_JUL2026) {
      const amounts = row.extra && /มูลค่า/.test(row.extra)
        ? row.extra
        : `มูลค่าสินค้า ${money2(row.net)}\nภาษีมูลค่าเพิ่ม ${money2(row.vat)}\nรวมทั้งสิ้น ${money2(row.net + row.vat)}`
      const text = [
        'ใบกำกับภาษี ต้นฉบับ',
        `เลขที่ ${row.invoiceNo}`,
        `วันที่ ${row.date}`,
        `เลขประจำตัวผู้เสียภาษี ${row.tin}`,
        amounts,
        row.extra && !/มูลค่า/.test(row.extra) ? row.extra : '',
      ].join('\n')
      const got = extractPurchaseTaxInvoiceFromScanText(text, { buyerTaxId: BUYER })
      expect(got?.invoiceNo, row.invoiceNo).toBe(row.expectNo)
      expect(got?.sellerTaxId, row.invoiceNo).toBe(row.tin)
      expect(got?.sellerName, row.invoiceNo).toContain(row.name)
      expect(got?.netAmount, row.invoiceNo).toBe(row.net)
      expect(got?.vatAmount, row.invoiceNo).toBe(row.vat)
    }
  })

  it('rejects junk invoice tokens and keeps the labeled office number', () => {
    const junk = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี เลขที่ ContactBcust\nเลขที่ NX2026-07-0177\nเลขประจำตัวผู้เสียภาษี 0105561016821\nมูลค่า 8,320.00 ภาษีมูลค่าเพิ่ม 582.40`,
      { buyerTaxId: BUYER }
    )
    expect(junk?.invoiceNo).toBe('NX2026-07-0177')
    expect(purchaseTaxInvoiceTextExtractIsComplete({ invoiceNo: 'ContactBcust', sellerTaxId: '0105561016821', netAmount: 100, vatAmount: 7 }, { buyerTaxId: BUYER })).toBe(false)

    const clever = extractPurchaseTaxInvoiceFromScanText(
      `เลขที่ 69070034\nเลขประจำตัวผู้เสียภาษี 0605565002677\nมูลค่า 231,141.61 ภาษีมูลค่าเพิ่ม 16,179.91`,
      { buyerTaxId: BUYER }
    )
    expect(clever?.sellerName).toContain('เคลฟเวอร์')
    expect(clever?.sellerTaxId).toBe('0605565002677')
  })

  it('keeps both DCI billing copy and DOI original when numbers differ', () => {
    const dci = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี สำเนา สำหรับวางบิล\nเลขที่ DCI-00-2607/0109\nเลขประจำตัวผู้เสียภาษี 0105544080525\nมูลค่า 98,000.00 ภาษีมูลค่าเพิ่ม 6,860.00`,
      { buyerTaxId: BUYER }
    )
    const doi = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี ต้นฉบับ\nเลขที่ DOI-00-2607/0103\nเลขประจำตัวผู้เสียภาษี 0105544080525\nมูลค่า 98,000.00 ภาษีมูลค่าเพิ่ม 6,860.00`,
      { buyerTaxId: BUYER }
    )
    expect(dci?.invoiceNo).toBe('DCI-00-2607/0109')
    expect(dci?.isCopy).toBeFalsy()
    expect(doi?.invoiceNo).toBe('DOI-00-2607/0103')
    expect(doi?.isCopy).toBeFalsy()

    const photocopy = extractPurchaseTaxInvoiceFromScanText(
      `ใบกำกับภาษี สำเนา\nเลขที่ 69070034\nเลขประจำตัวผู้เสียภาษี 0605565002677\nมูลค่า 231,141.61 ภาษีมูลค่าเพิ่ม 16,179.91`,
      { buyerTaxId: BUYER }
    )
    expect(photocopy?.invoiceNo).toBe('69070034')
    expect(photocopy?.isCopy).toBe(true)
  })
})

