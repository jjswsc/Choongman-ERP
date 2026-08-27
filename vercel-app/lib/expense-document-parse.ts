/** 인보이스·영수증에서 금액·일자·VAT·인보이스번호 등 추출 (휴리스틱 + Vision) */

import {
  digitSequencesFromExpenseFileName,
  extractRoughPdfText,
  parseQuoteAmountFromText,
} from '@/lib/interior-quote-amount-parse'
import { parseVendorNameHintFromText } from '@/lib/expense-ocr-suggestions'
import {
  purchaseTaxInvoiceHasExtractedFields,
  type ExtractedPurchaseTaxInvoiceFields,
} from '@/lib/purchase-tax-invoice-core'
import {
  extractPurchaseTaxInvoiceFromScanText,
  parsePurchaseTaxInvoiceFromPdfText,
  repairExtractedPurchaseTaxInvoice,
  type PurchaseTaxInvoiceScanHint,
} from '@/lib/purchase-tax-invoice-scan'

export type ParsedExpenseDocument = {
  amount?: number
  vatAmount?: number
  withholdingTaxAmount?: number
  expenseDate?: string
  invoiceNo?: string
  vendorNameHint?: string
  confidence: 'high' | 'medium' | 'low'
  method: 'keyword' | 'max' | 'vision' | 'mixed'
}

const DATE_KEYWORDS =
  /date|วันที่|ออกเมื่อ|ออกวันที่|document\s*date|invoice\s*date|วันเดือนปี/i

const DATE_PATTERNS = [
  /\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/,
  /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/,
  /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\b/i,
  // ไทย: 4 ส.ค. 2569 / 4 สิงหาคม 2569
  /\b(\d{1,2})\s+(ม\.?\s*ค\.?|ก\.?\s*พ\.?|มี\.?\s*ค\.?|เม\.?\s*ย\.?|พ\.?\s*ค\.?|มิ\.?\s*ย\.?|ก\.?\s*ค\.?|ส\.?\s*ค\.?|ก\.?\s*ย\.?|ต\.?\s*ค\.?|พ\.?\s*ย\.?|ธ\.?\s*ค\.?|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(\d{4})\b/i,
]

const THAI_MONTH_MAP: Record<string, number> = {
  'ม.ค': 1,
  'มค': 1,
  มกราคม: 1,
  'ก.พ': 2,
  'กพ': 2,
  กุมภาพันธ์: 2,
  'มี.ค': 3,
  'มีค': 3,
  มีนาคม: 3,
  'เม.ย': 4,
  'เมย': 4,
  เมษายน: 4,
  'พ.ค': 5,
  'พค': 5,
  พฤษภาคม: 5,
  'มิ.ย': 6,
  'มิย': 6,
  มิถุนายน: 6,
  'ก.ค': 7,
  'กค': 7,
  กรกฎาคม: 7,
  'ส.ค': 8,
  'สค': 8,
  สิงหาคม: 8,
  'ก.ย': 9,
  'กย': 9,
  กันยายน: 9,
  'ต.ค': 10,
  'ตค': 10,
  ตุลาคม: 10,
  'พ.ย': 11,
  'พย': 11,
  พฤศจิกายน: 11,
  'ธ.ค': 12,
  'ธค': 12,
  ธันวาคม: 12,
}

const INVOICE_NO_PATTERNS = [
  /\b(?:invoice|inv|tax\s*invoice|quotation|quote|เลขที่|ใบกำกับ|ใบเสนอราคา|เลขที่เอกสาร)\s*[#:.\-]?\s*([A-Z]{0,4}[\-/]?\d[A-Z0-9\-/]{2,30})\b/i,
  /\b((?:QO|QT|QU|INV|IV|TI|PO)[\-/]?\d{3,})\b/i,
]

const VAT_KEYWORDS =
  /vat|value\s*added|ภาษีมูลค่าเพิ่ม|ภ\.?\s*ม\.?|vat\s*7|7\s*%\s*vat|ภาษี\s*7/i

const WHT_KEYWORDS =
  /withhold|wht|withholding|ภาษีหัก|หัก\s*ณ\s*ที่จ่าย|pnd\s*3|pnd\s*53|wht\s*3/i

/** VAT/WHT 라인에서 세율(7, 3)로 오인하지 않도록 */
function isLikelyTaxRateNotAmount(n: number, fragment: string): boolean {
  if (!Number.isFinite(n) || n <= 0) return true
  if (n > 20) return false
  if (!Number.isInteger(n) && n > 20) return false
  // 7% / 3% 근처의 작은 정수
  if ([1, 2, 3, 5, 7, 10].includes(n) && /%|percent|อัตรา/i.test(fragment)) return true
  if ([3, 7].includes(n) && Number.isInteger(n)) return true
  return false
}

function parseMoneyCandidatesFromFragment(fragment: string): { amount: number; moneyLike: boolean }[] {
  const cleaned = fragment.replace(/฿|THB|บาท|Baht|USD|\$/gi, ' ')
  const out: { amount: number; moneyLike: boolean }[] = []
  const re = /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) {
    const raw = m[0]
    const moneyLike = /[.,]/.test(raw)
    const amount = Number(raw.replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount < 0 || amount >= 500_000_000) continue
    out.push({ amount, moneyLike })
  }
  return out
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

/** CE 또는 불력(พ.ศ. 2400+) → YYYY-MM-DD */
export function normalizeExpenseCalendarDate(y: number, m: number, d: number): string | undefined {
  let year = y
  if (year >= 2400 && year <= 2700) year -= 543
  if (year < 2000 || year > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined
  // 간단 유효성 (2월 31일 등 거부)
  const dt = new Date(Date.UTC(year, m - 1, d))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined
  return `${year}-${pad2(m)}-${pad2(d)}`
}

function thaiMonthToNumber(raw: string): number {
  const key = String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\./g, '')
  // map keys without dots
  for (const [k, v] of Object.entries(THAI_MONTH_MAP)) {
    if (k.replace(/\./g, '') === key || k === String(raw || '').trim()) return v
  }
  const compact = String(raw || '').replace(/\s+/g, '').replace(/\./g, '')
  return THAI_MONTH_MAP[compact] || THAI_MONTH_MAP[String(raw || '').trim()] || 0
}

function parseOneDateMatch(m: RegExpMatchArray, re: RegExp): string | undefined {
  if (re.source.startsWith('\\b(\\d{4})')) {
    return normalizeExpenseCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]))
  }
  if (/Jan|Feb/i.test(m[0])) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const mo = months.indexOf(String(m[2]).slice(0, 3).toLowerCase()) + 1
    return normalizeExpenseCalendarDate(Number(m[3]), mo, Number(m[1]))
  }
  if (/ม|ก\.|มี|เม|พ\.|มิ|ส\.|ต\.|ธ\.|มกรา|กุมภา|มีนา|เมษา|พฤษภา|มิถุนา|กรกฎา|สิงหา|กันยา|ตุลา|พฤศจิ|ธันวา/i.test(String(m[2] || ''))) {
    const mo = thaiMonthToNumber(String(m[2]))
    if (!mo) return undefined
    return normalizeExpenseCalendarDate(Number(m[3]), mo, Number(m[1]))
  }
  return normalizeExpenseCalendarDate(Number(m[3]), Number(m[2]), Number(m[1]))
}

export function parseExpenseDateFromText(text: string): string | undefined {
  const normalized = String(text || '').replace(/\u00a0/g, ' ')
  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  // 1) 날짜 키워드 줄 우선
  for (const line of lines) {
    if (!DATE_KEYWORDS.test(line)) continue
    for (const re of DATE_PATTERNS) {
      const m = line.match(re)
      if (!m) continue
      const out = parseOneDateMatch(m, re)
      if (out) return out
    }
  }

  // 2) 전체 텍스트
  for (const re of DATE_PATTERNS) {
    const m = normalized.match(re)
    if (!m) continue
    const out = parseOneDateMatch(m, re)
    if (out) return out
  }
  return undefined
}

/** 파일명에서 견적/인보이스 번호 후보 (QO260800139.pdf 등) */
export function parseInvoiceNoFromFileName(fileName: string): string | undefined {
  const base = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .trim()
  if (!base) return undefined
  const m = base.match(/\b((?:QO|QT|QU|INV|IV|TI|PO)[\-/]?\d{3,})\b/i)
  if (m?.[1]) return String(m[1]).toUpperCase().slice(0, 40)
  return undefined
}

export function parseInvoiceNoFromText(text: string, fileName?: string): string | undefined {
  const normalized = String(text || '')
  for (const re of INVOICE_NO_PATTERNS) {
    const m = normalized.match(re)
    if (m?.[1]) {
      const v = String(m[1]).trim().toUpperCase().slice(0, 40)
      // 순수 긴 숫자만이면 파일명/접두 패턴 없을 때 스킵 가능 — QO 등은 유지
      if (/^[A-Z]{0,4}\d+$/i.test(v) || /[A-Z]/i.test(v)) return v
    }
  }
  return parseInvoiceNoFromFileName(fileName || '')
}

function parseTaxLineAmount(text: string, keywordRe: RegExp): number | undefined {
  const lines = String(text || '').split(/\r?\n/)
  let best: { amount: number; moneyLike: boolean } | null = null
  for (const line of lines) {
    if (!keywordRe.test(line)) continue
    const cands = parseMoneyCandidatesFromFragment(line).filter(
      (c) => c.amount > 0 && !isLikelyTaxRateNotAmount(c.amount, line)
    )
    if (!cands.length) continue
    const money = cands.filter((c) => c.moneyLike)
    const picked = (money.length ? money : cands)[money.length ? money.length - 1 : cands.length - 1]
    if (
      !best ||
      (picked.moneyLike && !best.moneyLike) ||
      (picked.moneyLike === best.moneyLike && picked.amount >= best.amount)
    ) {
      best = picked
    }
  }
  return best?.amount
}

/** 총액(부가세 포함) 기준 7% VAT 추정 — 세율 숫자(7) 오인 보정용 */
export function estimateVatFromGrossInclusive(gross: number): number | undefined {
  if (!Number.isFinite(gross) || gross <= 0) return undefined
  const vat = Math.round(((gross * 7) / 107) * 100) / 100
  return vat > 0 ? vat : undefined
}

export function sanitizeVatAgainstGross(
  gross: number | undefined,
  vat: number | undefined
): number | undefined {
  if (vat == null || !(vat > 0)) return undefined
  if (vat <= 20 && Number.isInteger(vat)) {
    return gross && gross > 0 ? estimateVatFromGrossInclusive(gross) : undefined
  }
  if (gross && gross > 0) {
    if (vat >= gross) return estimateVatFromGrossInclusive(gross)
    const ratio = vat / gross
    // 태국 7% 포함가 비율 ≈ 0.0654, 별도 7% ≈ 0.07
    if (ratio < 0.02 || ratio > 0.12) {
      const est = estimateVatFromGrossInclusive(gross)
      if (est != null) return est
    }
  }
  return vat
}

export function sanitizeWhtAgainstGross(
  gross: number | undefined,
  wht: number | undefined
): number | undefined {
  if (wht == null || !(wht > 0)) return undefined
  if (wht <= 20 && Number.isInteger(wht)) return undefined
  if (gross && gross > 0) {
    if (wht >= gross) return undefined
    const ratio = wht / gross
    // 일반 원천 1~10%
    if (ratio > 0.15) return undefined
  }
  return wht
}

export function parseExpenseDocumentFromText(
  text: string,
  opts?: { fileName?: string }
): ParsedExpenseDocument | null {
  const normalized = String(text || '').replace(/\u00a0/g, ' ')
  if (!normalized.trim()) return null

  const fileName = opts?.fileName || ''
  const excludeDigitSequences = digitSequencesFromExpenseFileName(fileName)
  const amountParsed = parseQuoteAmountFromText(normalized, { excludeDigitSequences })
  const amount = amountParsed?.amount
  const vatRaw = parseTaxLineAmount(normalized, VAT_KEYWORDS)
  const whtRaw = parseTaxLineAmount(normalized, WHT_KEYWORDS)
  const vatAmount = sanitizeVatAgainstGross(amount, vatRaw)
  const withholdingTaxAmount = sanitizeWhtAgainstGross(amount, whtRaw)
  const expenseDate = parseExpenseDateFromText(normalized)
  const invoiceNo = parseInvoiceNoFromText(normalized, fileName)
  const vendorNameHint = parseVendorNameHintFromText(normalized)

  if (
    !amountParsed &&
    vatAmount == null &&
    withholdingTaxAmount == null &&
    !expenseDate &&
    !invoiceNo &&
    !vendorNameHint
  ) {
    return null
  }

  return {
    amount,
    vatAmount,
    withholdingTaxAmount,
    expenseDate,
    invoiceNo,
    vendorNameHint,
    confidence: amountParsed?.confidence ?? (expenseDate || invoiceNo ? 'medium' : 'low'),
    method: amountParsed?.method ?? 'keyword',
  }
}

async function extractExpenseDocumentWithVision(dataUrl: string): Promise<ParsedExpenseDocument | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.OPENAI_ERP_AI_MODEL?.trim() || 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content:
            'Extract fields from Thai restaurant expense invoices/receipts/quotations. Reply JSON only: {"amount":number,"vatAmount":number|null,"withholdingTaxAmount":number|null,"expenseDate":"YYYY-MM-DD"|null,"invoiceNo":string|null,"vendorName":string|null}. Rules: (1) amount = payable grand total THB (ยอดรวม/รวมทั้งสิ้น), NEVER a document/quotation number like QO260800139. (2) expenseDate must be Gregorian YYYY-MM-DD; if document shows Buddhist year พ.ศ. (e.g. 2569) convert to CE (2026). (3) invoiceNo = document number including QO/QT/INV prefixes. (4) vatAmount is baht amount not the rate 7. (5) vendorName is seller company. Use null for unknown.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract expense document fields. Prefer grand total, convert Thai Buddhist dates to CE, put quotation numbers in invoiceNo not amount.',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  })

  if (!res.ok) return null
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = json.choices?.[0]?.message?.content?.trim() || ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as {
      amount?: number
      vatAmount?: number | null
      withholdingTaxAmount?: number | null
      expenseDate?: string | null
      invoiceNo?: string | null
      vendorName?: string | null
    }
    const amountRaw = Number(parsed.amount)
    const amountOk =
      Number.isFinite(amountRaw) &&
      amountRaw > 0 &&
      amountRaw < 100_000_000 &&
      !(Number.isInteger(amountRaw) && amountRaw >= 10_000_000)
    const amount = amountOk ? amountRaw : undefined
    const vatAmount = sanitizeVatAgainstGross(
      amount,
      parsed.vatAmount != null ? Number(parsed.vatAmount) : undefined
    )
    const withholdingTaxAmount = sanitizeWhtAgainstGross(
      amount,
      parsed.withholdingTaxAmount != null ? Number(parsed.withholdingTaxAmount) : undefined
    )
    let expenseDate =
      parsed.expenseDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expenseDate)
        ? parsed.expenseDate
        : undefined
    // Vision이 불력을 그대로 준 경우 보정
    if (expenseDate) {
      const y = Number(expenseDate.slice(0, 4))
      if (y >= 2400) {
        expenseDate = normalizeExpenseCalendarDate(
          y,
          Number(expenseDate.slice(5, 7)),
          Number(expenseDate.slice(8, 10))
        )
      }
    }
    const invoiceNo = parsed.invoiceNo ? String(parsed.invoiceNo).trim().toUpperCase().slice(0, 40) : undefined
    const vendorNameHint = parsed.vendorName
      ? String(parsed.vendorName).trim().slice(0, 80)
      : undefined

    if (
      amount == null &&
      vatAmount == null &&
      withholdingTaxAmount == null &&
      !expenseDate &&
      !invoiceNo &&
      !vendorNameHint
    ) {
      return null
    }

    return {
      amount,
      vatAmount,
      withholdingTaxAmount,
      expenseDate,
      invoiceNo,
      vendorNameHint,
      confidence: 'high',
      method: 'vision',
    }
  } catch {
    return null
  }
}

function mergeParsedResults(
  primary: ParsedExpenseDocument | null | undefined,
  secondary: ParsedExpenseDocument | null | undefined,
  fileName: string
): ParsedExpenseDocument | null {
  if (!primary && !secondary) return null
  const amount = primary?.amount ?? secondary?.amount
  const vatAmount = sanitizeVatAgainstGross(
    amount,
    primary?.vatAmount ?? secondary?.vatAmount
  )
  const withholdingTaxAmount = sanitizeWhtAgainstGross(
    amount,
    primary?.withholdingTaxAmount ?? secondary?.withholdingTaxAmount
  )
  const expenseDate = primary?.expenseDate || secondary?.expenseDate
  const invoiceNo =
    primary?.invoiceNo || secondary?.invoiceNo || parseInvoiceNoFromFileName(fileName)
  const vendorNameHint = primary?.vendorNameHint || secondary?.vendorNameHint
  if (
    amount == null &&
    vatAmount == null &&
    withholdingTaxAmount == null &&
    !expenseDate &&
    !invoiceNo &&
    !vendorNameHint
  ) {
    return null
  }
  const method =
    primary?.method === 'vision' || secondary?.method === 'vision'
      ? primary?.method === 'vision' && secondary?.method && secondary.method !== 'vision'
        ? 'mixed'
        : primary?.method === 'vision'
          ? 'vision'
          : secondary?.method === 'vision'
            ? 'mixed'
            : primary?.method || secondary?.method || 'keyword'
      : primary?.method || secondary?.method || 'keyword'
  return {
    amount,
    vatAmount,
    withholdingTaxAmount,
    expenseDate,
    invoiceNo,
    vendorNameHint,
    confidence: primary?.confidence || secondary?.confidence || 'low',
    method,
  }
}

export async function extractExpenseDocumentFromDataUrl(
  dataUrl: string,
  fileName: string
): Promise<{ result: ParsedExpenseDocument | null; openaiUsed: boolean }> {
  const lower = fileName.toLowerCase()
  const isPdf = lower.endsWith('.pdf')
  const isImage = /\.(png|jpe?g|webp|gif|heic|heif)$/.test(lower) || dataUrl.startsWith('data:image/')

  try {
    if (isPdf && dataUrl.startsWith('data:')) {
      const b64 = dataUrl.split(',')[1] || ''
      const bytes = new Uint8Array(Buffer.from(b64, 'base64'))
      const text = extractRoughPdfText(bytes.buffer)
      const parsed = parseExpenseDocumentFromText(text, { fileName })
      // 금액 high + keyword만 휴리스틱 확정 — 그 외 Vision 보강
      if (parsed?.amount && parsed.confidence === 'high' && parsed.method === 'keyword') {
        // 일자·번호가 비어 있으면 Vision으로만 보강 시도(비용 있음) — 번호는 파일명으로 채움
        const withFileInvoice: ParsedExpenseDocument = {
          ...parsed,
          invoiceNo: parsed.invoiceNo || parseInvoiceNoFromFileName(fileName),
        }
        if (withFileInvoice.expenseDate && withFileInvoice.invoiceNo) {
          return { result: withFileInvoice, openaiUsed: false }
        }
      }
      const vision = await extractExpenseDocumentWithVision(dataUrl)
      if (vision) {
        const exclude = new Set(digitSequencesFromExpenseFileName(fileName))
        if (vision.amount != null && exclude.has(String(Math.trunc(vision.amount)))) {
          vision.amount = undefined
        }
        const merged = mergeParsedResults(vision, parsed, fileName)
        if (merged) return { result: merged, openaiUsed: true }
      }
      if (parsed) {
        return {
          result: {
            ...parsed,
            invoiceNo: parsed.invoiceNo || parseInvoiceNoFromFileName(fileName),
          },
          openaiUsed: false,
        }
      }
    }

    if (isImage) {
      const vision = await extractExpenseDocumentWithVision(dataUrl)
      if (vision) {
        const exclude = new Set(digitSequencesFromExpenseFileName(fileName))
        if (vision.amount != null && exclude.has(String(Math.trunc(vision.amount)))) {
          vision.amount = undefined
        }
        const merged = mergeParsedResults(vision, null, fileName)
        if (merged) return { result: merged, openaiUsed: true }
      }
    }
  } catch {
    // fall through
  }

  return { result: null, openaiUsed: false }
}

export type ParsedPurchaseTaxInvoice = ExtractedPurchaseTaxInvoiceFields

function finalizePurchaseTaxInvoices(
  invoices: ParsedPurchaseTaxInvoice[],
  hint?: PurchaseTaxInvoiceScanHint
): ParsedPurchaseTaxInvoice[] {
  return invoices
    .map((row) => repairExtractedPurchaseTaxInvoice(row, hint))
    .filter(purchaseTaxInvoiceHasExtractedFields)
}

export async function extractPurchaseTaxInvoicesFromImages(
  _dataUrls: string[],
  hint?: PurchaseTaxInvoiceScanHint
): Promise<{ invoices: ParsedPurchaseTaxInvoice[]; openaiUsed: boolean; error?: string }> {
  const pageText = String(hint?.pageText || '').trim()
  const fromText = pageText
    ? extractPurchaseTaxInvoiceFromScanText(pageText, hint) || parsePurchaseTaxInvoiceFromPdfText(pageText, hint)
    : null
  if (fromText && purchaseTaxInvoiceHasExtractedFields(fromText)) {
    return { invoices: finalizePurchaseTaxInvoices([fromText], hint), openaiUsed: false }
  }
  return { invoices: [], openaiUsed: false, error: 'empty_extract' }
}

export async function extractPurchaseTaxInvoiceFromDataUrl(
  dataUrl: string,
  hint?: PurchaseTaxInvoiceScanHint
): Promise<{ result: ParsedPurchaseTaxInvoice | null; openaiUsed: boolean; error?: string }> {
  const { invoices, openaiUsed, error } = await extractPurchaseTaxInvoicesFromImages([dataUrl], hint)
  return { result: invoices[0] || null, openaiUsed, error }
}

export async function extractPurchaseTaxInvoiceFromImageUrls(
  dataUrls: string[],
  hint?: PurchaseTaxInvoiceScanHint
): Promise<{ invoices: ParsedPurchaseTaxInvoice[]; openaiUsed: boolean; error?: string }> {
  return extractPurchaseTaxInvoicesFromImages(dataUrls, hint)
}
