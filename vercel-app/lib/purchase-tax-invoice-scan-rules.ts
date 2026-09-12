/**
 * 매입 세금계산서 스캔 확정 규칙 카탈로그.
 * 에이전트 규칙: `.cursor/rules/purchase-tax-invoice-scan.mdc`
 * 적용 확인: `purchase-tax-invoice-scan-rules.test.ts`
 *
 * 한 칸을 고칠 때 여기 케이스가 깨지면 다른 칸을 덮어쓴 것이다.
 */

export const PURCHASE_TAX_SCAN_BUYER_TIN = '0105568080622'

export type PurchaseTaxScanRuleField =
  | 'invoiceNo'
  | 'docDate'
  | 'sellerName'
  | 'sellerTaxId'
  | 'sellerBranch'
  | 'amount'

export type PurchaseTaxScanRuleExpect = {
  invoiceNo?: string
  invoiceNoNot?: RegExp
  docDate?: string
  sellerName?: string | RegExp
  sellerNameNot?: RegExp
  sellerTaxId?: string
  sellerTaxIdNot?: string
  sellerBranch?: string
  netAmount?: number
  vatAmount?: number
}

export type PurchaseTaxScanRuleCase = {
  id: string
  field: PurchaseTaxScanRuleField
  title: string
  text: string
  taxMonth?: string
  buyerTaxId?: string
  expect: PurchaseTaxScanRuleExpect
}

function page(...lines: string[]): string {
  return lines.join('\n')
}

const BUYER = PURCHASE_TAX_SCAN_BUYER_TIN
const AUG = '2026-08'

/** 기능 초기~오늘까지 확정된 공통 규칙. 거래처 한 장용 TIN 사전 확대 없음. */
export const PURCHASE_TAX_SCAN_RULES: PurchaseTaxScanRuleCase[] = [
  {
    id: 'inv-grab-im-not-partner-id',
    field: 'invoiceNo',
    title: 'Grab เลขที่ IM. Partner ID IDTHMG 금지',
    taxMonth: AUG,
    text: page(
      'Grabtaxi (Thailand) Co., Ltd. (Head Office)',
      'TAX ID 0105556090377',
      'รหัสพาร์ทเนอร์/Partner ID IDTHMG20250804101630012435',
      'ชื่อ/Name 1 บริษัท เอเชีย คอมเมิร์ซ แอนด์ เทรด จำกัด (สาขาที่ 00001)',
      'เลขที่/No. IM20260801054170',
      'วันที่/Date 01/08/2026',
      'รวมมูลค่าสินค้าและบริการ 3,819.49',
      'ภาษีมูลค่าเพิ่ม VAT 7% 267.36',
      'จำนวนเงินรวมทั้งสิ้น 4,086.85'
    ),
    expect: {
      invoiceNo: 'IM20260801054170',
      invoiceNoNot: /THMG|IDTHMG/i,
      sellerBranch: 'สำนักงานใหญ่',
      netAmount: 3819.49,
      vatAmount: 267.36,
    },
  },
  {
    id: 'inv-grab-gfad-not-thmg',
    field: 'invoiceNo',
    title: 'Grab Ads GFAD. THMG 파트너ID를 IM으로 쓰지 않음',
    taxMonth: AUG,
    text: page(
      'Grabtaxi (Thailand) Co., Ltd.',
      'เลขประจำตัวผู้เสียภาษี 0105556090377',
      'เลขที่/No. GFAD20260825011177',
      'วันที่ 25/08/2026',
      'รหัสพาร์ทเนอร์/Partner ID THMG20250616072219019783',
      'รวมมูลค่าสินค้าและบริการ 116.78',
      'ภาษีมูลค่าเพิ่ม 8.17',
      'จำนวนเงินรวมทั้งสิ้น 124.95'
    ),
    expect: { invoiceNo: 'GFAD20260825011177', invoiceNoNot: /THMG|IM202506/i, docDate: '2026-08-25' },
  },
  {
    id: 'inv-iv-over-bl-ref',
    field: 'invoiceNo',
    title: 'เลขที่เอกสาร IV. เอกสารอ้างอิง BL 금지',
    taxMonth: AUG,
    text: page(
      'บริษัท สปริงกรีนอีโวลูชัน จำกัด (สำนักงานใหญ่)',
      'เลขประจำตัวผู้เสียภาษี 0115559008515',
      'ลูกค้า:',
      'บริษัท เอเซีย คอมเมิร์ซ แอนด์ เทรด จำกัด (สาขา00001)',
      'เอกสารอ้างอิง BL260800093',
      'เลขที่เอกสาร IV260810392',
      'วันที่ 13/08/2569',
      'มูลค่าสินค้า 100.00',
      'ภาษีมูลค่าเพิ่ม 7.00',
      'รวมทั้งสิ้น 107.00'
    ),
    expect: { invoiceNo: 'IV260810392', invoiceNoNot: /^BL/i, sellerBranch: 'สำนักงานใหญ่' },
  },
  {
    id: 'inv-not-customer-code-ct',
    field: 'invoiceNo',
    title: 'เลขที่เอกสาร. 고객코드 CT 금지',
    taxMonth: AUG,
    text: page(
      'บริษัท ทีพีดี จำกัด',
      'เลขประจำตัวผู้เสียภาษี 0105530022307',
      'รหัสลูกค้า CT00215000',
      'เลขที่เอกสาร 102608004320',
      'วันที่ 08/08/2026',
      'จำนวนเงินก่อนภาษีมูลค่าเพิ่ม 1,581.80',
      'ภาษีมูลค่าเพิ่ม 110.73',
      'จำนวนเงินรวมทั้งสิ้น 1,692.53'
    ),
    expect: { invoiceNo: '102608004320', invoiceNoNot: /CT/i, sellerTaxId: '0105530022307' },
  },
  {
    id: 'inv-not-phone',
    field: 'invoiceNo',
    title: 'NR 번호. 전화번호 금지',
    taxMonth: '2026-07',
    text: page(
      'DELI TECHNOLOGY (THAI) CO.,LTD.',
      'เลขประจำตัวผู้เสียภาษีอากร 01055569056628 (สำนักงานใหญ่)',
      'โทรศัพท์ +66-800518201',
      'ลูกค้า บริษัท เอเซีย คอมเมิร์ซ แอนด์ เทรด จำกัด',
      'เลขที่ NR-260704333',
      'วันที่ 09 กรกฎาคม 2569',
      'จำนวนเงินรวมสุทธิ 354.21',
      'ภาษีมูลค่าเพิ่ม 7% 24.79',
      'จำนวนเงินรวมทั้งสิ้น 379.00'
    ),
    expect: { invoiceNo: 'NR-260704333', invoiceNoNot: /800518201/ },
  },
  {
    id: 'inv-atlas-iv-hi-not-product-1v',
    field: 'invoiceNo',
    title: 'Atlas IV-HI. 품목 48 KG 1V 금지. 발행지점 00368',
    taxMonth: AUG,
    text: page(
      'บริษัท แอตลาส เอ็นเนอยี จำกัด (มหาชน)',
      'เลขประจำตัวผู้เสียภาษี 0107565000557',
      'สาขาที่ออกใบกำกับภาษี สาขาที่ 00368',
      'เลขที่ลูกค้า : CU-435840',
      'ลูกค้า บริษัท เอเชีย คอมเมิร์ซ แอนด์ เทรด จำกัด (สาขา 00001)',
      'เลขที่ IV-HI652608050053',
      'วันที่ 05/08/2026',
      'แก๊สถัง 48 KG 1V 1.00 EA 1,484.00',
      'มูลค่าก่อนภาษี 1,386.92',
      'ภาษีมูลค่าเพิ่มอัตราร้อยละ 7 % 97.08',
      'จำนวนเงินทั้งสิ้น 1,484.00'
    ),
    expect: {
      invoiceNo: 'IV-HI652608050053',
      invoiceNoNot: /^1v?1$/i,
      sellerBranch: 'สาขา 00368',
      netAmount: 1386.92,
      vatAmount: 97.08,
    },
  },
  {
    id: 'inv-ocr-1v-to-iv',
    field: 'invoiceNo',
    title: 'OCR 1V → IV. Neo S 영어 상호·본점',
    taxMonth: AUG,
    text: page(
      'Neo S. Group Co., Ltd. (Head Office)',
      'เลขประจำตัวผู้เสียภาษี 0105540092693',
      'ต้นฉบับใบกำกับภาษี TAX INVOICE',
      'เลขที่ :',
      'NO. 1V0342325',
      'SOLD TO:',
      'บริษัท เอเชีย คอมเมิร์ซ แอนด์ เทรด จำกัด',
      'วันที่ DATE 03/08/69',
      'รวมราคาสินค้า TOTAL 6,138.32',
      'ภาษีมูลค่าเพิ่ม 429.68',
      'ยอดเงินรวม GRAND TOTAL 6,568.00'
    ),
    expect: { invoiceNo: 'IV0342325', sellerName: /Neo S\. Group/i, sellerNameNot: /เอเชีย คอมเมิร์ซ/i },
  },
  {
    id: 'inv-ivr-prefix',
    field: 'invoiceNo',
    title: 'IVR- 접두. 상호에서 สำนักงานใหญ่·ต้นฉบับ 제거',
    taxMonth: AUG,
    text: page(
      'บริษัท ทดสอบ จำกัด (สำนักงานใหญ่) ต้นฉบับ',
      'เลขประจำตัวผู้เสียภาษี 0105542024849',
      'ลูกค้า บริษัท เอเชีย คอมเมิร์ซ แอนด์ เทรด จำกัด (สาขาที่ 00001)',
      'เลขที่ IVR-260812345',
      'วันที่ 12/08/2569',
      'มูลค่าสินค้า 100.00',
      'ภาษีมูลค่าเพิ่ม 7.00',
      'รวมทั้งสิ้น 107.00'
    ),
    expect: {
      invoiceNo: 'IVR-260812345',
      sellerName: 'บริษัท ทดสอบ จำกัด',
      sellerNameNot: /สำนักงานใหญ่|ต้นฉบับ/,
      sellerBranch: 'สำนักงานใหญ่',
    },
  },
  {
    id: 'date-english-month-not-due',
    field: 'docDate',
    title: 'Invoice Date 월 이름. Payment Due 금지',
    taxMonth: AUG,
    text: page(
      'AC Plus Global Co., Ltd.',
      'Tax id : 0105540092693',
      'Invoice Number: RV2026-002895',
      'Invoice Date: August 5, 2026',
      'Payment Due: August 20, 2026',
      'Bill to',
      'บริษัท เอเชีย คอมเมิร์ซ แอนด์ เทรด จำกัด (สาขา00001)',
      'Subtotal: 3,105.00',
      'VAT 7%: 217.35',
      'Total: 3,322.35'
    ),
    expect: { invoiceNo: 'RV2026-002895', docDate: '2026-08-05' },
  },
  {
    id: 'date-kasikorn-issued-not-esign',
    field: 'docDate',
    title: '카시콘 วันที่ออกเอกสาร. 전자서명 익일 금지',
    taxMonth: AUG,
    text: page(
      'บริษัท ธนาคารกสิกรไทย จำกัด (มหาชน)',
      'เลขประจำตัวผู้เสียภาษี 0107536000315',
      'วันที่ออกเอกสาร 05/08/2569',
      'ลงลายมือชื่ออิเล็กทรอนิกส์ 06/08/2569 00:15 GMT+7',
      'เลขที่เอกสาร 370050826W01926',
      'ค่าธรรมเนียม 3.66',
      'ภาษีมูลค่าเพิ่ม 0.26'
    ),
    expect: { invoiceNo: '370050826W01926', docDate: '2026-08-05', sellerTaxId: '0107536000315' },
  },
  {
    id: 'date-be-yymm-from-invoice-no',
    field: 'docDate',
    title: '6908/0022 불기 연월. OCR 날짜 06/06이어도 8월',
    taxMonth: AUG,
    text: page(
      'บริษัท ไทตั้น คอม จำกัด (สำนักงานใหญ่)',
      'เลขประจำตัวผู้เสียภาษีอากร 0105542024849',
      'ชื่อลูกค้า Customers:',
      'บริษัท เอเซีย คอมเมิร์ซ แอนด์ เทรด จำกัด (สาขา00001)',
      'เลขที่ใบกำกับ / No. 6908/0022',
      'วันที่ / Date 06/06/2569',
      'รวมเงิน 1,790.00',
      'ภาษีมูลค่าเพิ่ม (VAT 7%) 125.30',
      'ยอดรวมสุทธิ NET AMOUNT 1,915.30'
    ),
    expect: { invoiceNo: '6908/0022', docDate: '2026-08-06', netAmount: 1790, vatAmount: 125.3 },
  },
  {
    id: 'branch-hq-not-buyer-00001',
    field: 'sellerBranch',
    title: '판매자 본점. 구매자 สาขา 00001 금지',
    taxMonth: AUG,
    text: page(
      'บริษัท ซี. เอ. พี. อินเตอร์เทรด จำกัด (สำนักงานใหญ่)',
      'เลขประจำตัวผู้เสียภาษี 0105540092693',
      'รหัสลูกค้า D1101740/1',
      'บริษัท เอเชีย คอมเมิร์ซ แอนด์ เทรด จำกัด',
      'TAX ID. 0105568080622 สาขา 00001',
      'เลขที่ ID16908/00062',
      'วันที่ 06/08/2569',
      'รวมเป็นเงิน 1,332.71',
      'ภาษีมูลค่าเพิ่ม 93.29',
      'จำนวนเงินรวมทั้งสิ้น 1,426.00'
    ),
    expect: { invoiceNo: 'ID16908/00062', sellerBranch: 'สำนักงานใหญ่', netAmount: 1332.71, vatAmount: 93.29 },
  },
  {
    id: 'name-panfood-spelling',
    field: 'sellerName',
    title: 'แพนฟุด/ฟุ้ด → แพนฟู้ด. 공급가 0.00 줄 스킵',
    taxMonth: AUG,
    text: page(
      'บริษัท แพนฟุ้ด จำกัด',
      'HEAD OFFICE',
      'เลขประจำตัวผู้เสียภาษีอากร 0745538001265',
      'ชื่อลูกค้า/CUSTOMER : R 7597',
      'เลขประจำตัวผู้เสียภาษี 0105568080622 สาขา 00001',
      'เลขที่ / INVOICE NO. IV690807-0378',
      'วันที่ / DATE 07/08/2026',
      'มูลค่าสินค้าก่อนเงินภาษี 0.00',
      'มูลค่าสินค้าคิดภาษี 1,700.00',
      'ภาษีมูลค่าเพิ่ม VAT 7% 119.00',
      'รวมเงินทั้งสิ้น NET AMOUNT 1,819.00'
    ),
    expect: {
      invoiceNo: 'IV690807-0378',
      sellerName: 'บริษัท แพนฟู้ด จำกัด',
      sellerBranch: 'สำนักงานใหญ่',
      netAmount: 1700,
      vatAmount: 119,
    },
  },
  {
    id: 'name-cap-si-ocr',
    field: 'sellerName',
    title: 'CAP ซี OCR 4.เอ.พี. 끝 S 제거. 본점',
    taxMonth: AUG,
    text: page(
      'บริษัท 4.เอ.พี.อินเตอร์เทรด S',
      'C.A.P. INTERTRADE CO., LTD. (สำนักงานใหญ่)',
      'เลขประจำตัวผู้เสียภาษี 0105540092693',
      'รหัสลูกค้า D1101740/1',
      'บริษัท เอเซีย คอมเมิร์ซ แอนด์ เทรด จำกัด',
      'TAX ID. 0105568080622 สาขา 00001',
      'เลขที่ ID16908/00087',
      'วันที่ 10/08/2569',
      'รวมเป็นเงิน 885.98',
      'ภาษีมูลค่าเพิ่ม 7.00% 62.02',
      'จำนวนเงินรวมทั้งสิ้น 948.00'
    ),
    expect: {
      invoiceNo: 'ID16908/00087',
      sellerName: /ซี\.เอ\.พี\.อินเตอร์เทรด/,
      sellerNameNot: /4\.เอ|อินเตอร์เทรด S/,
      sellerBranch: 'สำนักงานใหญ่',
    },
  },
  {
    id: 'name-not-marketplace-shop',
    field: 'sellerName',
    title: '법인명. Shopee 상점명 금지',
    taxMonth: AUG,
    text: page(
      'บริษัท ทีแกรนด์มอมเอด จำกัด (สำนักงานใหญ่)',
      'เลขประจำตัวผู้เสียภาษี 0105560027099',
      'เลขที่ CA2026081480',
      'วันที่ 09/08/2026',
      'ผู้ขาย Shopee (มะม่วงหิมพานต์เผา)',
      'ลูกค้า บริษัท เอเซีย คอมเมิร์ซ แอนด์ เทรด จำกัด (สาขา 00001)',
      'มูลค่าที่คำนวณภาษี 242.06',
      'ภาษีมูลค่าเพิ่ม 7% 16.94',
      'จำนวนเงินทั้งสิ้น 259.00'
    ),
    expect: {
      invoiceNo: 'CA2026081480',
      sellerName: 'บริษัท ทีแกรนด์มอมเอด จำกัด',
      sellerNameNot: /Shopee/i,
      sellerBranch: 'สำนักงานใหญ่',
    },
  },
  {
    id: 'name-not-ocr-jamphat-suffix',
    field: 'sellerName',
    title: 'ไทตั้น คอม. จำภัต·ต้นฉบับ 금지. VAT를 공급가로 쓰지 않음',
    taxMonth: AUG,
    text: page(
      'บริษัท ไทตั้น คอม จำกัด (สำนักงานใหญ่)',
      'เลขประจำตัวผู้เสียภาษีอากร 0105542024849',
      'ชื่อลูกค้า Customers:',
      'บริษัท เอเซีย คอมเมิร์ซ แอนด์ เทรด จำกัด (สาขา00001)',
      'เลขที่ใบกำกับ / No. 6908/0022',
      'วันที่ / Date 06/08/2569',
      'จำภัต (สำนักงานใหญ่) ต้นฉบับ',
      'รวมเงิน 1,790.00',
      'ภาษีมูลค่าเพิ่ม (VAT 7%) 125.30',
      'ยอดรวมสุทธิ NET AMOUNT 1,915.30'
    ),
    expect: {
      sellerName: 'บริษัท ไทตั้น คอม จำกัด',
      sellerNameNot: /จำภัต|ต้นฉบับ|สำนักงานใหญ่/,
      netAmount: 1790,
      vatAmount: 125.3,
    },
  },
  {
    id: 'tin-seller-not-buyer-true-move',
    field: 'sellerTaxId',
    title: '판매자 TIN·상호. รหัสลูกค้า 다음 판매자를 구매자로 오인 금지',
    taxMonth: AUG,
    text: page(
      'ใบเสร็จรับเงิน/ใบกำกับภาษี',
      'ที่อยู่ในการจัดส่งเอกสาร',
      'บริษัท เอเชีย คอมเมิร์ซ แอนด์ เทรด จำกัด',
      'วันที่ออกเอกสาร 27/08/2569',
      'เลขที่เอกสาร RFTKBKO27082026000023577',
      'รหัสลูกค้า 308003411',
      'หมายเลข 0971141183',
      'บริษัท ทรู มูฟ เอช ยูนิเวอร์แซล คอมมิวนิเคชั่น จำกัด',
      'เลขประจำตัวผู้เสียภาษี 0105553045044',
      'สำนักงานใหญ่',
      'ที่อยู่ตามภาษีมูลค่าเพิ่ม',
      'บริษัท เอเชีย คอมเมิร์ซ แอนด์ เทรด จำกัด',
      'เลขประจำตัวผู้เสียภาษี 0105568080622',
      'ค่าบริการ สิงหาคม 2569',
      'จำนวนเงินรวมก่อนภาษีมูลค่าเพิ่ม 399.00',
      'จำนวนภาษีมูลค่าเพิ่ม 27.93',
      'จำนวนเงินรวมภาษีมูลค่าเพิ่ม 426.93'
    ),
    expect: {
      sellerTaxId: '0105553045044',
      sellerTaxIdNot: BUYER,
      sellerName: /ทรู มูฟ เอช/,
      sellerNameNot: /เอเชีย คอมเมิร์ซ/,
    },
  },
  {
    id: 'tin-not-buyer-fallback',
    field: 'sellerTaxId',
    title: '판매자 TIN. 구매자 TIN으로 채우지 않음',
    taxMonth: AUG,
    text: page(
      'บริษัท ผู้ขาย จำกัด',
      'เลขประจำตัวผู้เสียภาษี 0105559082715',
      'ผู้ซื้อ บริษัท เอเชีย คอมเมิร์ซ แอนด์ เทรด จำกัด',
      'เลขประจำตัวผู้เสียภาษีผู้ซื้อ 0105568080622',
      'เลขที่ INV-20260801001',
      'วันที่ 01/08/2026',
      'มูลค่าสินค้า 100.00',
      'ภาษีมูลค่าเพิ่ม 7.00',
      'รวมทั้งสิ้น 107.00'
    ),
    expect: { sellerTaxId: '0105559082715', sellerTaxIdNot: BUYER, invoiceNo: 'INV-20260801001' },
  },
  {
    id: 'amt-skip-zero-before-tax-and-vat-rate',
    field: 'amount',
    title: '과세 공급가. 0.00 줄·세율 7을 금액으로 쓰지 않음',
    taxMonth: AUG,
    text: page(
      'บริษัท แพนฟุด จำกัด',
      'HEAD OFFICE',
      'เลขประจำตัวผู้เสียภาษีอากร 0745538001265',
      'เลขที่ IV690807-0378',
      'วันที่ 07/08/2026',
      'มูลค่าสินค้าก่อนเงินภาษี 0.00',
      'มูลค่าสินค้าคิดภาษี 1,700.00',
      'ภาษีมูลค่าเพิ่ม VAT 7% 119.00',
      'รวมเงินทั้งสิ้น NET AMOUNT 1,819.00'
    ),
    expect: { netAmount: 1700, vatAmount: 119 },
  },
  {
    id: 'amt-not-withholding',
    field: 'amount',
    title: 'VAT. หัก ณ ที่จ่าย 금지',
    text: page(
      'ใบกำกับภาษี เลขที่ INV2026070017',
      'เลขประจำตัวผู้เสียภาษี 0105562090693',
      'มูลค่าสินค้า 10,411.22',
      'หัก ณ ที่จ่าย 312.34',
      'ภาษีมูลค่าเพิ่ม 728.79',
      'รวมทั้งสิ้น 11,140.01'
    ),
    expect: { invoiceNo: 'INV2026070017', netAmount: 10411.22, vatAmount: 728.79 },
  },
  {
    id: 'amt-not-grand-as-vat-reverse',
    field: 'amount',
    title: '인쇄된 공급가+VAT. Grand를 /0.07 역산 금지',
    text: page(
      'ใบกำกับภาษี เลขที่ INV-1',
      'เลขประจำตัวผู้เสียภาษี 0105559082715',
      'มูลค่าสินค้า 1,000.00',
      'ภาษีมูลค่าเพิ่ม 70.00',
      'รวมทั้งสิ้น 1,070.00'
    ),
    expect: { netAmount: 1000, vatAmount: 70 },
  },
]
