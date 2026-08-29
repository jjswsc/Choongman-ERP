/** ใบกำกับภาษีซื้อ 등록함 — 순수 헬퍼 (DB 없음) */

import { roundMoney2 } from '@/lib/invoice-vat-total'

export const PURCHASE_TAX_INVOICE_SOURCES = ['manual', 'inbound_batch', 'pdf'] as const
export type PurchaseTaxInvoiceSource = (typeof PURCHASE_TAX_INVOICE_SOURCES)[number]

export const PURCHASE_TAX_INVOICE_EXCEL_HEADERS = [
  'ลำดับที่',
  'วันที่ใบกำกับภาษี',
  'เลขที่ใบกำกับภาษี',
  'ชื่อผู้จำหน่าย',
  'เลขผู้เสียภาษี',
  'สำนักงานใหญ่/สาขา',
  'มูลค่า',
  'ภาษีมูลค่าเพิ่ม',
] as const

export const SELLER_BRANCH_HQ = 'สำนักงานใหญ่'

export const PURCHASE_TAX_INV_LEDGER_MEMO_PREFIX = '[AUTO:PURCHASE_TAX_INV:'

export type PurchaseTaxInvoiceInput = {
  storeName: string
  buyerTaxId: string
  docDate: string
  invoiceNo: string
  sellerName: string
  sellerTaxId: string
  sellerBranch?: string
  netAmount: number
  vatAmount: number
  totalAmount?: number
  source?: PurchaseTaxInvoiceSource
  inboundBatchId?: number | null
  attachmentUrls?: string[]
  memo?: string
}

export type PurchaseTaxInvoiceRow = {
  id: number
  storeName: string
  buyerTaxId: string
  taxMonth: string
  docDate: string
  invoiceNo: string
  sellerName: string
  sellerTaxId: string
  sellerBranch: string
  netAmount: number
  vatAmount: number
  totalAmount: number
  source: PurchaseTaxInvoiceSource
  inboundBatchId: number | null
  attachmentUrls: string[]
  memo: string
}

export function digitsTin13(raw: unknown): string {
  return String(raw || '')
    .replace(/\D/g, '')
    .trim()
    .slice(0, 13)
}

export function isTin13(raw: unknown): boolean {
  return digitsTin13(raw).length === 13
}

/** 태국 13자리 TIN 체크디짓 (가중치 13→2, mod 11). */
export function thaiTinChecksumOk(raw: unknown): boolean {
  const d = digitsTin13(raw)
  if (d.length !== 13) return false
  let sum = 0
  for (let i = 0; i < 12; i += 1) sum += Number(d[i]) * (13 - i)
  const check = (11 - (sum % 11)) % 10
  return check === Number(d[12])
}

export function taxMonthFromDocDate(docDate: string): string {
  const ymd = String(docDate || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd.slice(0, 7) : ''
}

export function formatSellerBranch(raw: unknown): string {
  const s = String(raw || '').trim()
  if (!s) return SELLER_BRANCH_HQ
  if (/สำนักงานใหญ่|head\s*office|\bhq\b|본사|본점/i.test(s) && !/\d/.test(s)) return SELLER_BRANCH_HQ
  const digits = s.replace(/\D/g, '')
  if (digits) {
    const padded = digits.padStart(5, '0').slice(-5)
    if (padded === '00000') return SELLER_BRANCH_HQ
    return `สาขา ${padded}`
  }
  return s.slice(0, 80)
}

/** UI 표시용. 저장 값은 항상 formatSellerBranch (태국 양식). */
export function displaySellerBranchForUi(
  raw: unknown,
  labels: { hq: string; branch: string }
): string {
  const formatted = formatSellerBranch(raw)
  if (formatted === SELLER_BRANCH_HQ) return labels.hq
  const m = formatted.match(/สาขา\s*(\d+)/)
  if (m) return `${labels.branch} ${m[1]}`
  return formatted
}

export function purchaseTaxInvoiceDedupeKey(
  buyerTaxId: string,
  invoiceNo: string,
  sellerTaxId: string
): string {
  const inv = String(invoiceNo || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
  return `${digitsTin13(buyerTaxId)}|${inv}|${digitsTin13(sellerTaxId)}`
}

export function normalizeInvoiceNo(raw: unknown): string {
  return String(raw || '').trim().slice(0, 128)
}

export function parsePurchaseTaxInvIdFromMemo(memo: string): number {
  const m = String(memo || '').match(/\[AUTO:PURCHASE_TAX_INV:(\d+)\]/)
  if (!m) return 0
  return Math.floor(Number(m[1]) || 0)
}

export function purchaseTaxInvLedgerMemoTag(id: number): string {
  return `${PURCHASE_TAX_INV_LEDGER_MEMO_PREFIX}${Math.floor(id)}]`
}

export function formatPp30Amount2(n: number | null | undefined): string {
  const v = roundMoney2(Number(n) || 0)
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function gregorianYmdToBuddhistHint(ymd: string): string {
  const y = Number(String(ymd || '').slice(0, 4))
  if (!Number.isFinite(y) || y < 1900) return ''
  return `ค.ศ. ${y} = พ.ศ. ${y + 543}`
}

export function normalizePurchaseTaxInvoiceSource(raw: unknown): PurchaseTaxInvoiceSource {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'inbound_batch' || v === 'pdf') return v
  return 'manual'
}

export function parseAttachmentUrlsJson(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 20)
  }
  const s = String(raw || '').trim()
  if (!s) return []
  try {
    const parsed = JSON.parse(s) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 20)
    }
  } catch {
    /* plain url */
  }
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return [s.slice(0, 200000)]
  return []
}

export function serializeAttachmentUrls(urls: string[]): string | null {
  const cleaned = (urls || []).map((u) => String(u || '').trim()).filter(Boolean).slice(0, 20)
  return cleaned.length ? JSON.stringify(cleaned) : null
}

export function roundPurchaseTaxAmounts(net: number, vat: number, total?: number): {
  netAmount: number
  vatAmount: number
  totalAmount: number
} {
  const netAmount = roundMoney2(Math.max(0, Number(net) || 0))
  const vatAmount = roundMoney2(Math.max(0, Number(vat) || 0))
  const totalAmount =
    total != null && Number.isFinite(Number(total))
      ? roundMoney2(Math.max(0, Number(total) || 0))
      : roundMoney2(netAmount + vatAmount)
  return { netAmount, vatAmount, totalAmount }
}

export type PurchaseTaxInvoiceValidationError =
  | 'doc_date'
  | 'invoice_no'
  | 'seller_name'
  | 'seller_tax_id'
  | 'buyer_tax_id'
  | 'store_name'
  | 'amounts'

export function validatePurchaseTaxInvoiceInput(
  input: PurchaseTaxInvoiceInput
): PurchaseTaxInvoiceValidationError | null {
  if (!String(input.storeName || '').trim()) return 'store_name'
  if (!isTin13(input.buyerTaxId)) return 'buyer_tax_id'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.docDate || '').slice(0, 10))) return 'doc_date'
  if (!normalizeInvoiceNo(input.invoiceNo)) return 'invoice_no'
  if (!String(input.sellerName || '').trim()) return 'seller_name'
  if (!isTin13(input.sellerTaxId)) return 'seller_tax_id'
  const { netAmount, vatAmount } = roundPurchaseTaxAmounts(input.netAmount, input.vatAmount, input.totalAmount)
  if (netAmount < 0 || vatAmount < 0) return 'amounts'
  return null
}

export type ExtractedPurchaseTaxInvoiceFields = {
  docDate?: string
  invoiceNo?: string
  sellerName?: string
  sellerTaxId?: string
  sellerBranch?: string
  netAmount?: number
  vatAmount?: number
  totalAmount?: number
  isCopy?: boolean
}

export function isLikelyTaxInvoiceCopy(raw: unknown): boolean {
  const s = String(raw || '').trim()
  if (!s) return false
  if (/ต้นฉบับ/.test(s)) return false
  if (/สำหรับวางบิล/.test(s)) return false
  return /สำเนา|สำเนาเอกสาร|copy\b|duplicate|true copy|สำเนาใบ/i.test(s)
}

/** OCR이 Seller ID·숫자만 읽은 상호는 거래처 기억으로 덮음 */
export function looksLikeJunkSellerName(raw: unknown): boolean {
  const s = String(raw || '').trim()
  if (s.length < 4) return true
  if (/^(id|seller\s*id|merchant\s*id|tax\s*id|tin|customer\s*id)\b/i.test(s)) return true
  if (/^id\s*[|:.\/]/i.test(s)) return true
  if (/^[\d\s|.:#\-/]{4,}$/.test(s)) return true
  if (/[!|]/.test(s) && /\d{5,}/.test(s) && !/บริษัท|ห้าง|ร้าน|ทรัสต์/.test(s)) return true
  if (/ซอย|แขวง|เขต|ถนน/.test(s) && !/บริษัท|ห้าง|ร้าน|ทรัสต์/.test(s)) return true
  const hasEntity = /บริษัท|ห้าง|ร้าน|ทรัสต์|limited|l\.?t\.?d|co\.?\s*ltd|\bco\b|นาย|นางสาว|นาง/i.test(s)
  if (!hasEntity) {
    if (/จนกว่า/.test(s)) return true
    if (/^(find|fad|contact|customer|taxrex)s?$/i.test(s)) return true
    if (/^[A-Za-z]{2,16}$/.test(s)) return true
  }
  return false
}

function sanitizeTaxInvoiceMoney(n: unknown): number | undefined {
  if (n == null || n === '') return undefined
  const v =
    typeof n === 'number'
      ? n
      : Number(
          String(n)
            .replace(/,/g, '')
            .replace(/[^\d.-]/g, '')
        )
  if (!Number.isFinite(v) || v < 0 || v >= 500_000_000) return undefined
  return Math.round(v * 100) / 100
}

export function purchaseTaxInvoiceHasExtractedFields(row: ExtractedPurchaseTaxInvoiceFields): boolean {
  return Boolean(
    row.invoiceNo ||
      row.sellerName ||
      row.sellerTaxId ||
      row.netAmount != null ||
      row.vatAmount != null ||
      row.totalAmount != null
  )
}

function maybeGregorianDocDate(raw: unknown): string | undefined {
  const s = String(raw || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  const y = Number(s.slice(0, 4))
  if (y >= 2400) {
    const ce = y - 543
    if (ce < 1990 || ce > 2100) return undefined
    return `${String(ce).padStart(4, '0')}${s.slice(4)}`
  }
  return s
}

function visionField(parsed: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const v = parsed[key]
    if (v != null && v !== '') return v
  }
  return undefined
}

function normalizePurchaseTaxInvoiceVisionRow(parsed: Record<string, unknown>): ExtractedPurchaseTaxInvoiceFields {
  const invoiceRaw = visionField(parsed, ['invoiceNo', 'invoice_no', 'docNo', 'doc_no', 'number', 'no'])
  const invoiceNo =
    invoiceRaw == null || invoiceRaw === ''
      ? undefined
      : String(invoiceRaw).trim().slice(0, 80)
  const sellerTaxId = String(
    visionField(parsed, ['sellerTaxId', 'seller_tax_id', 'taxId', 'tax_id', 'tin']) || ''
  )
    .replace(/\D/g, '')
    .slice(0, 13)
  const sellerName = visionField(parsed, ['sellerName', 'seller_name', 'vendorName', 'vendor'])
  const sellerBranch = visionField(parsed, ['sellerBranch', 'seller_branch', 'branch'])
  const isCopyRaw = visionField(parsed, ['isCopy', 'is_copy', 'copy'])
  const isCopy =
    isCopyRaw === true || /สำเนา|true copy|duplicate/i.test(String(isCopyRaw || ''))
  return {
    docDate: maybeGregorianDocDate(
      visionField(parsed, ['docDate', 'doc_date', 'date', 'issueDate', 'issue_date'])
    ),
    invoiceNo: invoiceNo || undefined,
    sellerName: sellerName ? String(sellerName).trim().slice(0, 200) : undefined,
    sellerTaxId: sellerTaxId.length === 13 ? sellerTaxId : undefined,
    sellerBranch: sellerBranch ? String(sellerBranch).trim().slice(0, 80) : undefined,
    netAmount: sanitizeTaxInvoiceMoney(
      visionField(parsed, ['netAmount', 'net_amount', 'baseAmount', 'taxableAmount'])
    ),
    vatAmount: sanitizeTaxInvoiceMoney(visionField(parsed, ['vatAmount', 'vat_amount', 'vat'])),
    totalAmount: sanitizeTaxInvoiceMoney(
      visionField(parsed, ['totalAmount', 'total_amount', 'grandTotal', 'total'])
    ),
    isCopy,
  }
}

function visionRowsFromParsed(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (!parsed || typeof parsed !== 'object') return []
  const obj = parsed as Record<string, unknown>
  for (const key of ['invoices', 'items', 'results', 'documents', 'taxInvoices', 'data']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }
  if (obj.invoice && typeof obj.invoice === 'object' && !Array.isArray(obj.invoice)) {
    return [obj.invoice]
  }
  return [obj]
}

/** Vision JSON → 페이지당 0~n건 (한 장에 세금계산서 2매 가능) */
export function parsePurchaseTaxInvoiceVisionPayload(raw: string): ExtractedPurchaseTaxInvoiceFields[] {
  const text = String(raw || '').trim()
  const objMatch = text.match(/\{[\s\S]*\}/)
  const arrMatch = !objMatch ? text.match(/\[[\s\S]*\]/) : null
  const jsonText = objMatch?.[0] || arrMatch?.[0]
  if (!jsonText) return []
  try {
    const parsed = JSON.parse(jsonText) as unknown
    return visionRowsFromParsed(parsed)
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
      .map(normalizePurchaseTaxInvoiceVisionRow)
      .filter(purchaseTaxInvoiceHasExtractedFields)
  } catch {
    return []
  }
}

export const PURCHASE_TAX_VAT_MISMATCH_TOLERANCE = 0.05

/** VAT가 있는 행만 7%와 비교. 0원은 면세·영세 가능이라 경고하지 않음. */
export function purchaseTaxVatLooksWrong(net: unknown, vat: unknown): boolean {
  const n = Number(net)
  const v = Number(vat)
  if (!Number.isFinite(n) || !Number.isFinite(v) || v <= 0) return false
  return Math.abs(roundMoney2(n * 0.07) - roundMoney2(v)) > PURCHASE_TAX_VAT_MISMATCH_TOLERANCE
}

export function purchaseTaxDocMonthMismatch(docDate: unknown, taxMonth: string): boolean {
  const month = taxMonthFromDocDate(String(docDate || ''))
  const want = String(taxMonth || '').trim().slice(0, 7)
  return Boolean(month && want && month !== want)
}

export type PurchaseTaxReviewFlag = 'vat' | 'month' | 'tin'

export function purchaseTaxReviewFlags(
  row: {
    skip?: boolean
    docDate?: string
    sellerTaxId?: string
    netAmount?: string | number
    vatAmount?: string | number
  },
  taxMonth: string
): PurchaseTaxReviewFlag[] {
  const flags: PurchaseTaxReviewFlag[] = []
  const tin = String(row.sellerTaxId || '').replace(/\D/g, '')
  if (tin && (tin.length !== 13 || !thaiTinChecksumOk(tin))) flags.push('tin')
  if (!row.skip && purchaseTaxDocMonthMismatch(row.docDate, taxMonth)) flags.push('month')
  if (!row.skip && purchaseTaxVatLooksWrong(row.netAmount, row.vatAmount)) flags.push('vat')
  return flags
}

export function purchaseTaxReviewIsProblem(
  row: {
    skip?: boolean
    invoiceNo?: string
    sellerTaxId?: string
    docDate?: string
    netAmount?: string | number
    vatAmount?: string | number
  },
  taxMonth: string
): boolean {
  if (row.skip) return false
  if (!String(row.invoiceNo || '').trim()) return true
  return purchaseTaxReviewFlags(row, taxMonth).some((flag) => flag !== 'month')
}

export function purchaseTaxPp30Compare(opts: {
  registerVat: number
  reviewKeepVat: number
  pp30InputVat: number
  pp30OutputVat: number
}) {
  const registerVat = roundMoney2(Number(opts.registerVat) || 0)
  const reviewKeepVat = roundMoney2(Number(opts.reviewKeepVat) || 0)
  const pp30InputVat = roundMoney2(Number(opts.pp30InputVat) || 0)
  const pp30OutputVat = roundMoney2(Number(opts.pp30OutputVat) || 0)
  const afterSaveVat = roundMoney2(registerVat + reviewKeepVat)
  return {
    registerVat,
    reviewKeepVat,
    afterSaveVat,
    pp30InputVat,
    pp30OutputVat,
    ledgerGap: roundMoney2(registerVat - pp30InputVat),
    payableNow: roundMoney2(pp30OutputVat - registerVat),
    payableAfterReview: roundMoney2(pp30OutputVat - afterSaveVat),
    inSync: Math.abs(registerVat - pp30InputVat) <= PURCHASE_TAX_VAT_MISMATCH_TOLERANCE,
  }
}
