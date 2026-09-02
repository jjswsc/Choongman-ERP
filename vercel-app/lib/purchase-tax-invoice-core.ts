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

/** UI 표시용. 본점은 빈칸, 지점은 번호만 — 저장 값은 항상 formatSellerBranch (태국 양식). */
export function displaySellerBranchForUi(
  raw: unknown,
  _labels?: { hq: string; branch: string }
): string {
  const formatted = formatSellerBranch(raw)
  if (formatted === SELLER_BRANCH_HQ) return ''
  const m = formatted.match(/สาขา\s*(\d+)/)
  if (m) return m[1]
  return formatted
}

/** Shopee 머리: `TRSPESPF00`, `TRSPEFHM00` (OCR `OO`→`00`, 단독 `O`→`00`) */
const SHOPEE_PREFIX_SRC = 'TRS[A-Z]{2,10}00'

export function normalizeShopeeInvoiceBlob(raw: string): string {
  return String(raw || '')
    .replace(/\s+/g, '')
    .replace(/!/g, '1')
    .replace(/PF0[CO]/gi, 'PF00')
    .replace(/(TRS[A-Z]{2,10})[O0]{2}/gi, (_m, p: string) => `${String(p).toUpperCase()}00`)
    .replace(/(TRS[A-Z]{2,10})O(?=\d)/gi, (_m, p: string) => `${String(p).toUpperCase()}00`)
}

function shopeeHasUniqueTail(s: string): boolean {
  return Boolean(shopeeUniqueInvoiceTail(s)) || new RegExp(`${SHOPEE_PREFIX_SRC}-\\d{5}-\\d{6}-\\d{5,8}$`, 'i').test(s)
}

/** `TRSPEFHM00-00000-26` · `TRSPEFHMO21189195` 처럼 고유 꼬리가 빠진 쇼피 번호 */
export function isTruncatedShopeeInvoiceNo(raw: unknown): boolean {
  const original = String(raw || '').replace(/\s+/g, '')
  const s = normalizeShopeeInvoiceBlob(original)
  if (!s && !original) return false
  if (!/^TRS[A-Z]/i.test(s) && !/^TRS[A-Z]/i.test(original)) return false
  if (shopeeHasUniqueTail(s) || shopeeHasUniqueTail(original)) return false
  return true
}

/**
 * 쇼피 고유 번호. 칸이 두 줄(`TRSPEFHM00-00000026` + `0821-001305`)이어도
 * 빨간 원 구간만 남긴다: `260821-001305`.
 */
export function shopeeUniqueInvoiceTail(raw: unknown): string | undefined {
  const s = normalizeShopeeInvoiceBlob(String(raw || ''))
  if (!s) return undefined
  const fromTrs = s.match(new RegExp(`${SHOPEE_PREFIX_SRC}-?\\d{5}-?(\\d{6})-?(\\d{5,8})`, 'i'))
  if (fromTrs) return `${fromTrs[1]}-${fromTrs[2]}`
  const tail = s.match(/^(\d{6})-(\d{5,8})$/)
  if (tail) return `${tail[1]}-${tail[2]}`
  return undefined
}

/**
 * OCR이 머리글자 I를 1(또는 l, |)로 읽은 경우.
 * 숫자 1을 I로 일괄 바꾸면 IM/INV가 깨지므로, 알려진 접두만 되돌린다.
 */
export function fixOcrInvoiceLetterIPrefix(raw: string): string {
  const s = String(raw || '')
  if (/^1NV(?=[-/]?\d)/i.test(s)) return s.replace(/^1NV/i, 'INV')
  if (/^1NCT(?=\d)/i.test(s)) return s.replace(/^1NCT/i, 'INCT')
  if (/^1VT(?=[-/]?\d)/i.test(s)) return s.replace(/^1VT/i, 'IVT')
  if (/^1M(?=20\d{12}$)/i.test(s)) return s.replace(/^1M/i, 'IM')
  if (/^[Il1|]V(?=\d{6})/.test(s)) return s.replace(/^[Il1|]V/, 'IV')
  return s
}

/** OCR이 ID 접두를 10/1D/I0 으로 읽거나, Original 조각(orto)을 번호 뒤에 붙인 경우 */
export function fixOcrInvoiceIdPrefix(raw: string): string {
  const s = String(raw || '')
  const m = s.match(/^([Il1][D0O])(\d{4,8}\/\d{3,8})$/i)
  if (m) return `ID${m[2]}`
  if (/^ID\d/i.test(s)) return `ID${s.slice(2)}`
  return s
}

export function compactPurchaseInvoiceToken(raw: string): string {
  const stripped = String(raw || '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '')
    .trim()
    .replace(/(\d)[A-Za-z]{3,}$/g, '$1')
  const fixed = fixOcrInvoiceIdPrefix(fixOcrInvoiceLetterIPrefix(stripped))
  return shortenLongLetterPrefixedInvoiceNo(fixed)
}

/**
 * `RFTKBKO27082026000023577` 처럼 영문 머리 + 일·월 + 서기연도 + 일련번호가 긴 경우
 * 연도부터 (`2026000023577`) 만 남긴다. `TITKBK008072026…` 는 일·월이 아니라 그대로 둔다.
 */
export function shortenLongLetterPrefixedInvoiceNo(raw: string): string {
  const s = String(raw || '').trim()
  const packed = s.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (packed.length < 22) return s
  const m = packed.match(/^([A-Z]{5,12})(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})(\d{7,})$/)
  if (!m) return s
  return `${m[4]}${m[5]}`
}

/**
 * 같은 장인가. 머리글자만 빠지거나 OCR이 I를 1로 읽은 경우는 같고,
 * 날짜가 들어 있는 본문이 다르면(IV20260818-2330 vs IV20260820-2330) 다른 문서.
 * 끝 일련번호만 같다고 합치지 않는다.
 */
export function purchaseInvoiceNosAreSameDocument(a?: string, b?: string): boolean {
  const ta = shopeeUniqueInvoiceTail(a)
  const tb = shopeeUniqueInvoiceTail(b)
  if (ta && tb) return ta === tb
  if (ta || tb) return false
  if (isTruncatedShopeeInvoiceNo(a) || isTruncatedShopeeInvoiceNo(b)) return false
  const compact = (s?: string) =>
    compactPurchaseInvoiceToken(String(s || ''))
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
  const na = compact(a)
  const nb = compact(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const strip = (t: string) => t.replace(/^(INV|IVT|IV|NX|NC|RV|SI|CS|DCI|DOI|TI|ABB|RT)/, '')
  const sa = strip(na)
  const sb = strip(nb)
  if (sa === sb && sa.length >= 6) return true
  const letterPrefixOnly = (longer: string, shorter: string) => {
    if (shorter.length < 6 || !longer.endsWith(shorter)) return false
    const extra = longer.slice(0, longer.length - shorter.length)
    return /^[A-Z]{1,4}$/.test(extra) && !/[A-Z]/.test(shorter)
  }
  return letterPrefixOnly(na, nb) || letterPrefixOnly(nb, na)
}

export function purchaseInvoiceConflictsWithPrior(
  invoiceNo: string,
  sellerTaxId: string,
  prior: Array<{ invoiceNo?: string; sellerTaxId?: string }>
): boolean {
  const no = String(invoiceNo || '').trim()
  if (!no) return false
  const tin = digitsTin13(sellerTaxId)
  return prior.some(
    (r) =>
      String(r.invoiceNo || '').trim() &&
      digitsTin13(r.sellerTaxId) === tin &&
      purchaseInvoiceNosAreSameDocument(r.invoiceNo, no)
  )
}

export function purchaseTaxInvoiceDedupeKey(
  buyerTaxId: string,
  invoiceNo: string,
  sellerTaxId: string
): string {
  const raw = compactPurchaseInvoiceToken(String(invoiceNo || '')).toUpperCase()
  const inv = shopeeUniqueInvoiceTail(raw) || raw
  return `${digitsTin13(buyerTaxId)}|${inv}|${digitsTin13(sellerTaxId)}`
}

export function normalizeInvoiceNo(raw: unknown): string {
  return String(raw || '').trim().slice(0, 128)
}

export function uniquePositiveIds(raw: unknown, max = 2000): number[] {
  const list = Array.isArray(raw) ? raw : []
  const out: number[] = []
  const seen = new Set<number>()
  for (const v of list) {
    const id = Math.floor(Number(v) || 0)
    if (id <= 0 || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= max) break
  }
  return out
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

/** 상호 뒤 주소 번지(523 6 3)를 잘라 บริษัท … จำกัด 만 남긴다 */
export function trimPurchaseTaxSellerName(raw: unknown): string {
  let s = String(raw || '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!s) return ''
  s = s.replace(/ชนาคาร/g, 'ธนาคาร')
  s = s.replace(/บริษัท\s+1\.\s+(?=[\u0E00-\u0E7F]+\.)/g, 'บริษัท ซี. ')
  s = s.replace(/\.\s+(?=[\u0E00-\u0E7F])/g, '.')
  s = s.replace(/\s*ใบ(?:กำกับ(?:ภาษี)?|เสร็จ(?:รับเงิน)?|ส่งสินค้า|แจ้งหนี้).*$/u, '')
  s = s.replace(/(จำกัด(?:\s*\(มหาชน\))?)ใบ$/u, '$1')
  const entity = s.match(/^(.*?(?:บริษัท|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วน)\s+.{1,80}?จำกัด(?:\s*\(มหาชน\))?)/)
  if (entity) s = entity[1].trim()
  s = s.replace(/\s+\d[\d\s./\-]{0,24}$/, '').trim()
  return s.slice(0, 200)
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

export type PurchaseTaxReviewFlag = 'vat' | 'month' | 'tin' | 'amount'

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
  const netRaw = String(row.netAmount ?? '').trim()
  const vatRaw = String(row.vatAmount ?? '').trim()
  const netEmpty = netRaw === '' || !Number.isFinite(Number(netRaw))
  const vatEmpty = vatRaw === '' || !Number.isFinite(Number(vatRaw))
  // 공급가·부가세가 둘 다 비면 검수 문제. 0/0(영세)은 숫자로 채워진 것이므로 통과.
  if (!row.skip && netEmpty && vatEmpty) flags.push('amount')
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
  const invoice = String(row.invoiceNo || '').trim()
  if (!invoice) return true
  if (isTruncatedShopeeInvoiceNo(invoice)) return true
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
