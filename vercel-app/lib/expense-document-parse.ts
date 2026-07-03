/** 인보이스·영수증에서 금액·일자·VAT·인보이스번호 등 추출 (휴리스틱 + Vision) */

import {
  extractRoughPdfText,
  parseQuoteAmountFromText,
  extractQuoteAmountWithVision,
} from '@/lib/interior-quote-amount-parse'
import { parseVendorNameHintFromText } from '@/lib/expense-ocr-suggestions'

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

const DATE_PATTERNS = [
  /\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/,
  /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/,
  /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
]

const INVOICE_NO_PATTERNS = [
  /\b(?:invoice|inv|tax\s*invoice|เลขที่|ใบกำกับ)\s*[#:.\-]?\s*([A-Z0-9][A-Z0-9\-/]{2,30})\b/i,
  /\b(IV[\-/]?\d{3,})\b/i,
  /\b(TI[\-/]?\d{3,})\b/i,
]

const VAT_KEYWORDS =
  /vat|value\s*added|ภาษีมูลค่าเพิ่ม|ภ\.?ม\.?|pp\s*30|7\s*%/i

const WHT_KEYWORDS =
  /withhold|wht|withholding|ภาษีหัก|หัก\s*ณ\s*ที่จ่าย|pnd\s*3|pnd\s*53|3\s*%/i

function parseNumbersFromFragment(fragment: string): number[] {
  const cleaned = fragment
    .replace(/฿|THB|บาท|Baht|USD|\$/gi, ' ')
    .replace(/,/g, '')
  const matches = cleaned.match(/\d+(?:\.\d{1,2})?/g) || []
  return matches
    .map((m) => Number(m))
    .filter((n) => Number.isFinite(n) && n >= 0 && n < 500_000_000)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function normalizeDate(y: number, m: number, d: number): string | undefined {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined
  return `${y}-${pad2(m)}-${pad2(d)}`
}

export function parseExpenseDateFromText(text: string): string | undefined {
  const normalized = String(text || '').replace(/\u00a0/g, ' ')
  for (const re of DATE_PATTERNS) {
    const m = normalized.match(re)
    if (!m) continue
    if (re.source.startsWith('\\b(\\d{4})')) {
      const y = Number(m[1])
      const mo = Number(m[2])
      const d = Number(m[3])
      const out = normalizeDate(y, mo, d)
      if (out) return out
    } else if (/Jan|Feb/i.test(m[0])) {
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      const mo = months.indexOf(String(m[2]).slice(0, 3).toLowerCase()) + 1
      const d = Number(m[1])
      const y = Number(m[3])
      const out = normalizeDate(y, mo, d)
      if (out) return out
    } else {
      const d = Number(m[1])
      const mo = Number(m[2])
      const y = Number(m[3])
      const out = normalizeDate(y, mo, d)
      if (out) return out
    }
  }
  return undefined
}

export function parseInvoiceNoFromText(text: string): string | undefined {
  const normalized = String(text || '')
  for (const re of INVOICE_NO_PATTERNS) {
    const m = normalized.match(re)
    if (m?.[1]) return String(m[1]).trim().slice(0, 40)
  }
  return undefined
}

function parseTaxLineAmount(text: string, keywordRe: RegExp): number | undefined {
  const lines = String(text || '').split(/\r?\n/)
  for (const line of lines) {
    if (!keywordRe.test(line)) continue
    const nums = parseNumbersFromFragment(line)
    if (!nums.length) continue
    const candidate = nums[nums.length - 1]
    if (candidate > 0) return candidate
  }
  return undefined
}

export function parseExpenseDocumentFromText(text: string): ParsedExpenseDocument | null {
  const normalized = String(text || '').replace(/\u00a0/g, ' ')
  if (!normalized.trim()) return null

  const amountParsed = parseQuoteAmountFromText(normalized)
  const vatAmount = parseTaxLineAmount(normalized, VAT_KEYWORDS)
  const withholdingTaxAmount = parseTaxLineAmount(normalized, WHT_KEYWORDS)
  const expenseDate = parseExpenseDateFromText(normalized)
  const invoiceNo = parseInvoiceNoFromText(normalized)
  const vendorNameHint = parseVendorNameHintFromText(normalized)

  if (!amountParsed && vatAmount == null && !expenseDate && !invoiceNo && !vendorNameHint) return null

  return {
    amount: amountParsed?.amount,
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
      max_tokens: 350,
      messages: [
        {
          role: 'system',
          content:
            'Extract fields from Thai restaurant expense invoices/receipts. Reply JSON only: {"amount":number,"vatAmount":number|null,"withholdingTaxAmount":number|null,"expenseDate":"YYYY-MM-DD"|null,"invoiceNo":string|null,"vendorName":string|null}. amount is total gross THB without commas. vendorName is seller/vendor company name if visible. Use null for unknown.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract expense document fields from this image or PDF page.' },
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
    const amount = Number(parsed.amount)
    const vatAmount = parsed.vatAmount != null ? Number(parsed.vatAmount) : undefined
    const withholdingTaxAmount =
      parsed.withholdingTaxAmount != null ? Number(parsed.withholdingTaxAmount) : undefined
    const expenseDate =
      parsed.expenseDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expenseDate)
        ? parsed.expenseDate
        : undefined
    const invoiceNo = parsed.invoiceNo ? String(parsed.invoiceNo).trim().slice(0, 40) : undefined
    const vendorNameHint = parsed.vendorName
      ? String(parsed.vendorName).trim().slice(0, 80)
      : undefined

    if (
      (!Number.isFinite(amount) || amount <= 0) &&
      vatAmount == null &&
      withholdingTaxAmount == null &&
      !expenseDate &&
      !invoiceNo &&
      !vendorNameHint
    ) {
      return null
    }

    return {
      amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
      vatAmount: Number.isFinite(vatAmount) && (vatAmount ?? 0) > 0 ? vatAmount : undefined,
      withholdingTaxAmount:
        Number.isFinite(withholdingTaxAmount) && (withholdingTaxAmount ?? 0) > 0
          ? withholdingTaxAmount
          : undefined,
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
      const parsed = parseExpenseDocumentFromText(text)
      if (parsed?.amount && parsed.confidence === 'high') {
        return { result: parsed, openaiUsed: false }
      }
      const vision = await extractExpenseDocumentWithVision(dataUrl)
      if (vision) return { result: vision, openaiUsed: true }
      if (parsed) return { result: parsed, openaiUsed: false }
    }

    if (isImage) {
      const vision = await extractExpenseDocumentWithVision(dataUrl)
      if (vision) return { result: vision, openaiUsed: true }
    }
  } catch {
    // fall through
  }

  return { result: null, openaiUsed: false }
}
