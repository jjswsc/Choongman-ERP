/**
 * PP30 / Flowaccount 스타일 VAT 정산 엑셀 (사용자 제공 템플릿 "VAT Reconcile" 구조 정렬).
 * 시트: PP.30.MM, OutputTaxReport, InputTaxReport, MM.26 (카드타입 요약 자리 — ERP 미집계 안내)
 */
import * as XLSX from 'xlsx'
import type { VatLedgerRow } from '@/lib/vat-ledger-csv'

const THAI_MONTHS = [
  '',
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]

export type Pp30VatReconcileCompanyBlock = {
  companyName: string
  companyTaxIdDigits: string
  /** สถานประกอบการ — ERP에 없으면 빈칸 */
  placeOfBusiness?: string
  /** เช่น "ปทุมวัน 00001" */
  branchOfficeLabel?: string
}

export type Pp30VatReconcileTotals = {
  outputNet: number
  outputVat: number
  inputNet: number
  inputVat: number
}

export type Pp30VatReconcileBuildParams = {
  taxMonth: string
  /** UI에서 쓰는 기간 문구 (เดือน … ปี …) */
  periodDescriptionLine: string
  company: Pp30VatReconcileCompanyBlock
  storeLabel?: string
  outputRows: VatLedgerRow[]
  inputRows: VatLedgerRow[]
  totals: Pp30VatReconcileTotals
  filingStatusLabel: (filingStatus: string | null | undefined) => string
  filingRoundLabel: string
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function toDdMmYyyy(docDate: string): string {
  const s = String(docDate || '').trim().slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return s
  return `${m[3]}/${m[2]}/${m[1]}`
}

function digitsTaxId(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/\D/g, '')
    .trim()
}

function parseExpRef(memo: string): string {
  const m = String(memo || '').match(/EXP\d{6,}/i)
  return m ? m[0]! : ''
}

/** RD e-Filing 수동 업로드용 요약 시트 (ZIP 대신 동일 XLSX에 포함) */
function buildEfilingRdSummarySheet(params: Pp30VatReconcileBuildParams): (string | number)[][] {
  const c = params.company
  const t = params.totals
  const outN = round2(t.outputNet)
  const outV = round2(t.outputVat)
  const inN = round2(t.inputNet)
  const inV = round2(t.inputVat)
  const payableVat = round2(outV - inV)
  const dueVat = payableVat > 0 ? payableVat : 0
  const creditVat = payableVat < 0 ? round2(Math.abs(payableVat)) : 0
  const taxId = digitsTaxId(c.companyTaxIdDigits)

  return [
    ['e-Filing-RD / PP30 manual package summary', ''],
    ['Tax month (YYYY-MM)', params.taxMonth],
    ['Store (ERP)', params.storeLabel || ''],
    ['Taxpayer name', c.companyName],
    ['Tax ID (13 digits)', taxId],
    ['Branch', c.branchOfficeLabel || ''],
    ['Place of business', c.placeOfBusiness || ''],
    ['Filing round', params.filingRoundLabel],
    ['Period (Thai)', params.periodDescriptionLine],
    [],
    ['PP30 totals (from ledger)', 'Amount'],
    ['Output — net', outN],
    ['Output — VAT', outV],
    ['Input — net', inN],
    ['Input — VAT', inV],
    ['VAT payable (out − in)', payableVat],
    ['Amount to pay', dueVat],
    ['VAT credit', creditVat],
    [],
    ['Output rows', params.outputRows.length],
    ['Input rows', params.inputRows.length],
    [],
    ['Checklist for rd.go.th e-Filing', ''],
    ['1', 'Open sheet PP.30.MM and verify totals vs Output/Input tax reports'],
    ['2', 'Log in e-Filing → file PP30 for this tax month'],
    ['3', 'Enter taxpayer / branch from rows above'],
    ['4', 'Enter sales/purchase VAT from PP30 totals'],
    ['5', 'Attach supporting documents and submit'],
    [],
    ['Note', 'This file is not sent via RD Open API. Upload manually in e-Filing.'],
  ]
}

function buildPp30CalculationSheet(params: {
  taxMonth: string
  totals: Pp30VatReconcileTotals
}): (string | number)[][] {
  const ym = String(params.taxMonth || '').trim()
  const [y, mo] = ym.split('-')
  const mm = (mo || '').padStart(2, '0')
  const yyyy = y || ''
  const outN = round2(params.totals.outputNet)
  const outV = round2(params.totals.outputVat)
  const inN = round2(params.totals.inputNet)
  const inV = round2(params.totals.inputVat)
  const payableVat = round2(outV - inV)
  const dueVat = payableVat > 0 ? payableVat : 0
  const creditVat = payableVat < 0 ? round2(Math.abs(payableVat)) : 0

  return [
    ['', `PP30 Calculation sheet  ${mm}/${yyyy} `, '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['ตาม Flowaccount', '', '', '', '', '', '', '', ''],
    ['', 'เอกสาร', 'มูลค่า', 'ภาษีมูลค่าเพิ่ม', '', '', '', '', ''],
    ['', 'ภาษีขาย', outN, outV, '', '', '', '', ''],
    ['', 'ภาษีซื้อ', inN, inV, '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', 'PP30', payableVat, '', '', '', ''],
    ['', '', '', 'เครคิตภาษียกมา', creditVat, '', '', '', ''],
    ['', '', '', 'ชำระภาษี ', dueVat, '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['ตาม ภพ 30', 'รายงาน', 'มูลค่า', 'ภาษีมูลค่าเพิ่ม', '', '', '', '', ''],
    ['', 'ภาษีขาย', outN, outV, '', outN, outV, '', ''],
    ['', 'ภาษีซื้อ', inN, inV, '', inN, inV, '', ''],
    ['', '', '', 'PP30', payableVat, '', '', payableVat, '', ''],
    ['', '', '', 'เครคิตภาษียกมา', creditVat, '', '', '', '', ''],
    ['', '', '', 'ชำระภาษี', dueVat, '', '', '', '', ''],
  ]
}

const OUTPUT_HEADERS = [
  'ลำดับที่',
  'วัน/เดือน/ปี',
  'เลขที่เอกสาร',
  'เลขที่อ้างอิง',
  'ชื่อลูกค้า',
  'ชื่อโปรเจ็ค',
  'เลขผู้เสียภาษี',
  'สำนักงานใหญ่/สาขา',
  'มูลค่า',
  'ภาษีมูลค่าเพิ่ม',
  'เอกสารอ้างอิงในระบบ',
  'สถานะ',
  'รอบการยื่นภาษี',
]

const INPUT_HEADERS = [
  'ลำดับที่',
  'วันที่ใบกำกับภาษี',
  'เลขที่ใบกำกับภาษี',
  'เลขที่อ้างอิง',
  'ชื่อผู้จำหน่าย',
  'ชื่อโปรเจ็ค',
  'เลขผู้เสียภาษี',
  'สำนักงานใหญ่/สาขา',
  'มูลค่า',
  'ภาษีมูลค่าเพิ่ม',
  'เอกสารอ้างอิงในระบบ',
  'สถานะ',
  'รอบการยื่นภาษี',
]

function companyHeaderLines(c: Pp30VatReconcileCompanyBlock, periodLine: string, title: string): (string | number)[][] {
  const taxLine =
    c.companyName && c.companyTaxIdDigits
      ? `ชื่อผู้ประกอบการ ${c.companyName} เลขประจำผู้เสียภาษีอากร ${c.companyTaxIdDigits}`
      : c.companyName
        ? `ชื่อผู้ประกอบการ ${c.companyName}`
        : `เลขประจำผู้เสียภาษีอากร ${c.companyTaxIdDigits || '-'}`

  const branch = String(c.branchOfficeLabel || '').trim()
  const place = String(c.placeOfBusiness || '').trim()
  const row3Right = branch ? `สำนักงาน/สาขาเลขที่ ${branch}` : 'สำนักงาน/สาขาเลขที่ '

  return [
    [title, '', '', '', '', '', '', '', '', '', '', '', ''],
    [periodLine, '', '', '', '', '', '', '', '', '', '', '', ''],
    [taxLine, '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', 'ชื่อสถานที่ประกอบการ ', place, '', row3Right, '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', ''],
  ]
}

function buildOutputSheet(
  params: Pp30VatReconcileBuildParams,
  sorted: VatLedgerRow[],
  totals: { net: number; vat: number }
): (string | number)[][] {
  const lines: (string | number)[][] = [
    ...companyHeaderLines(params.company, params.periodDescriptionLine, 'รายงานภาษีขาย'),
    OUTPUT_HEADERS,
  ]
  let i = 0
  for (const r of sorted) {
    i += 1
    const memo = String(r.memo || '')
    lines.push([
      i,
      toDdMmYyyy(String(r.doc_date || '')),
      String(r.invoice_number || ''),
      parseExpRef(memo),
      String(r.counterparty_name || ''),
      '',
      digitsTaxId(r.counterparty_tax_id),
      '',
      round2(Number(r.net_amount) || 0),
      round2(Number(r.vat_amount) || 0),
      memo.slice(0, 500),
      params.filingStatusLabel(r.filing_status),
      params.filingRoundLabel,
    ])
  }
  lines.push([
    '',
    '',
    '',
    '',
    'ยอดรวมทั้งหมด',
    '',
    '',
    'ยอดรวมทั้งหมด',
    totals.net,
    totals.vat,
    '',
    '',
    '',
  ])
  return lines
}

function buildInputSheet(
  params: Pp30VatReconcileBuildParams,
  sorted: VatLedgerRow[],
  totals: { net: number; vat: number }
): (string | number)[][] {
  const lines: (string | number)[][] = [
    ...companyHeaderLines(params.company, params.periodDescriptionLine, 'รายงานภาษีซื้อ(ภ.พ.30)'),
    INPUT_HEADERS,
  ]
  let i = 0
  for (const r of sorted) {
    i += 1
    const memo = String(r.memo || '')
    lines.push([
      i,
      toDdMmYyyy(String(r.doc_date || '')),
      String(r.invoice_number || ''),
      parseExpRef(memo),
      String(r.counterparty_name || ''),
      memo.replace(/\[AUTO:[^\]]+\]\s*/g, '').slice(0, 240),
      digitsTaxId(r.counterparty_tax_id),
      '',
      round2(Number(r.net_amount) || 0),
      round2(Number(r.vat_amount) || 0),
      memo.slice(0, 500),
      params.filingStatusLabel(r.filing_status),
      params.filingRoundLabel,
    ])
  }
  lines.push([
    '',
    '',
    '',
    '',
    'ยอดรวมทั้งหมด',
    '',
    '',
    'ยอดรวมทั้งหมด',
    totals.net,
    totals.vat,
    '',
    '',
    '',
  ])
  return lines
}

/** ตาราง 04.26 ตามต้นฉบับ — ยอดจาก ERP ไม่ได้แยกช่องทางชำระแบบ Flowaccount */
function buildCardTypePlaceholderSheet(mm: string): (string | number)[][] {
  const label = `${mm}.26`
  return [
    ['Sales Report by Card Type - Delivery', '', '', `Sales Report by Card Type - Credit Card`, '', ''],
    ['Card Type', 'Total Sales', '', 'Card Type', 'Total Sales', ''],
    ['Foodpanda', 0, '', 'Alipay', 0, ''],
    ['Grab', 0, '', 'Gift Voucher', 0, ''],
    ['Line Man', 0, '', 'JCB', 0, ''],
    ['Robinhood', 0, '', 'Master Card', 0, ''],
    ['Shopee Food', 0, '', 'Online Banking', 0, ''],
    ['Shopee Pay', 0, '', 'Rabbit Card', 0, ''],
    ['', 0, '', 'UnionPay', 0, ''],
    ['', 0, '', 'Visa', 0, ''],
    ['', '', '', 'Wechat', 0, ''],
    ['Total', 0, '', 'Prompay', 0, ''],
    ['', '', '', 'True Food', 0, ''],
    ['', '', '', 'True Money Wallet', 0, ''],
    ['', '', '', 'Total', 0, 0],
    ['', '', '', '', '', ''],
    [
      '(หมายเหตุ ERP)',
      'ระบบไม่ได้สรุปยอดตาม Card Type แบบ Flowaccount — กรอกเองจากรายงานเครื่องรูด/ช่องทางชำระ',
      '',
      '',
      '',
      '',
    ],
    ['', label, '', '', '', ''],
  ]
}

function sortVatRows(rows: VatLedgerRow[]): VatLedgerRow[] {
  return [...rows].sort((a, b) => {
    const da = String(a.doc_date || '')
    const db = String(b.doc_date || '')
    if (da !== db) return da.localeCompare(db)
    return (Number(a.id) || 0) - (Number(b.id) || 0)
  })
}

export function buildPp30VatReconcileWorkbook(params: Pp30VatReconcileBuildParams): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const ym = String(params.taxMonth || '').trim()
  const moNum = Number(ym.slice(5, 7)) || 1
  const mm = ym.slice(5, 7).padStart(2, '0')
  const yyyy = ym.slice(0, 4)
  const thaiMonth = THAI_MONTHS[moNum] || ym
  const periodDefault = `สำหรับงวดภาษี เดือน ${thaiMonth} ปี ${yyyy}`
  const exportParams: Pp30VatReconcileBuildParams = {
    ...params,
    periodDescriptionLine: String(params.periodDescriptionLine || '').trim() || periodDefault,
  }

  const outSorted = sortVatRows(exportParams.outputRows)
  const inSorted = sortVatRows(exportParams.inputRows)
  const outTotals = {
    net: round2(outSorted.reduce((s, r) => s + (Number(r.net_amount) || 0), 0)),
    vat: round2(outSorted.reduce((s, r) => s + (Number(r.vat_amount) || 0), 0)),
  }
  const inTotals = {
    net: round2(inSorted.reduce((s, r) => s + (Number(r.net_amount) || 0), 0)),
    vat: round2(inSorted.reduce((s, r) => s + (Number(r.vat_amount) || 0), 0)),
  }

  const ppData = buildPp30CalculationSheet({ taxMonth: ym, totals: exportParams.totals })
  const shPp = XLSX.utils.aoa_to_sheet(ppData)
  shPp['!cols'] = [{ wch: 4 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }]
  XLSX.utils.book_append_sheet(wb, shPp, `PP.30.${mm}`)

  const outData = buildOutputSheet(exportParams, outSorted, outTotals)
  const shOut = XLSX.utils.aoa_to_sheet(outData)
  shOut['!cols'] = Array.from({ length: 13 }, (_, i) => ({ wch: i === 4 || i === 5 ? 36 : i >= 8 && i <= 9 ? 14 : 12 }))
  XLSX.utils.book_append_sheet(wb, shOut, 'OutputTaxReport')

  const inData = buildInputSheet(exportParams, inSorted, inTotals)
  const shIn = XLSX.utils.aoa_to_sheet(inData)
  shIn['!cols'] = Array.from({ length: 13 }, (_, i) => ({ wch: i === 4 || i === 5 ? 40 : i >= 8 && i <= 9 ? 14 : 12 }))
  XLSX.utils.book_append_sheet(wb, shIn, 'InputTaxReport')

  const cardSheet = XLSX.utils.aoa_to_sheet(buildCardTypePlaceholderSheet(mm))
  XLSX.utils.book_append_sheet(wb, cardSheet, `${mm}.26`)

  const efilingData = buildEfilingRdSummarySheet(exportParams)
  const shEfiling = XLSX.utils.aoa_to_sheet(efilingData)
  shEfiling['!cols'] = [{ wch: 42 }, { wch: 28 }]
  XLSX.utils.book_append_sheet(wb, shEfiling, 'eFiling-RD')

  return wb
}

export function buildPp30VatReconcileXlsxBuffer(params: Pp30VatReconcileBuildParams): ArrayBuffer {
  const wb = buildPp30VatReconcileWorkbook(params)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

export function formatThaiVatPeriodLine(taxMonth: string): string {
  const ym = String(taxMonth || '').trim().slice(0, 7)
  const [y, m] = ym.split('-')
  const mi = Math.min(12, Math.max(1, Number(m) || 1))
  return `สำหรับงวดภาษี เดือน ${THAI_MONTHS[mi] || m} ปี ${y || ''}`
}

export function filingRoundLabelFromTaxMonth(taxMonth: string): string {
  const ym = String(taxMonth || '').trim().slice(0, 7)
  const [y, m] = ym.split('-')
  const mm = (m || '').padStart(2, '0')
  return `${mm}-${y} (ยื่นปกติ)`
}

/** UI: 다운로드 전 검증 — 필수는 회사명·13자리 เลขประจำตัวผู้เสียภาษี */
export function listPp30VatReconcileFieldGaps(c: Pp30VatReconcileCompanyBlock): {
  required: ('companyName' | 'companyTaxId13')[]
  optional: ('placeOfBusiness' | 'branchOfficeLabel')[]
} {
  const required: ('companyName' | 'companyTaxId13')[] = []
  if (!String(c.companyName || '').trim()) required.push('companyName')
  const d = digitsTaxId(c.companyTaxIdDigits)
  if (d.length !== 13) required.push('companyTaxId13')
  const optional: ('placeOfBusiness' | 'branchOfficeLabel')[] = []
  if (!String(c.placeOfBusiness || '').trim()) optional.push('placeOfBusiness')
  if (!String(c.branchOfficeLabel || '').trim()) optional.push('branchOfficeLabel')
  return { required, optional }
}
