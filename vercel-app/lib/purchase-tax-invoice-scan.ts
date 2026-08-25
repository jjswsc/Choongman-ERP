/**
 * ใบกำกับภาษีซื้อ 전용 스캔 파이프라인.
 * Cursor가 원본 전체를 보고 필드를 읽듯이: (1) PDF 텍스트층 (2) 전체 페이지 이미지 (3) 매수자 TIN 힌트 (4) 금액 교차검증.
 */

import {
  digitsTin13,
  purchaseTaxInvoiceHasExtractedFields,
  purchaseTaxVatLooksWrong,
  type ExtractedPurchaseTaxInvoiceFields,
} from '@/lib/purchase-tax-invoice-core'
import { roundMoney2 } from '@/lib/invoice-vat-total'

export type PurchaseTaxInvoiceScanHint = {
  buyerTaxId?: string
  buyerName?: string
  pageText?: string
}

const THAI_MONTH: Record<string, number> = {
  'ม.ค': 1,
  มค: 1,
  มกราคม: 1,
  'ก.พ': 2,
  กพ: 2,
  กุมภาพันธ์: 2,
  'มี.ค': 3,
  มีค: 3,
  มีนาคม: 3,
  'เม.ย': 4,
  เมย: 4,
  เมษายน: 4,
  'พ.ค': 5,
  พค: 5,
  พฤษภาคม: 5,
  'มิ.ย': 6,
  มิย: 6,
  มิถุนายน: 6,
  'ก.ค': 7,
  กค: 7,
  กรกฎาคม: 7,
  'ส.ค': 8,
  สค: 8,
  สิงหาคม: 8,
  'ก.ย': 9,
  กย: 9,
  กันยายน: 9,
  'ต.ค': 10,
  ตค: 10,
  ตุลาคม: 10,
  'พ.ย': 11,
  พย: 11,
  พฤศจิกายน: 11,
  'ธ.ค': 12,
  ธค: 12,
  ธันวาคม: 12,
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

function moneyFromFragment(raw: string): number | undefined {
  const s = String(raw || '')
  const money = s.match(/\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/)
  const v = money
    ? Number(money[0].replace(/,/g, ''))
    : (() => {
        const n = s.match(/\d{1,7}(?!\d)/)
        return n ? Number(n[0]) : NaN
      })()
  if (!Number.isFinite(v) || v < 0 || v >= 500_000_000) return undefined
  return roundMoney2(v)
}

function ymdFromParts(year: number, month: number, day: number): string | undefined {
  let y = year
  if (y >= 2400) y -= 543
  if (y < 1990 || y > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseTaxInvoiceDateFromText(text: string): string | undefined {
  const s = String(text || '')
  const iso = s.match(/\b(20\d{2}|25\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/)
  if (iso) {
    return ymdFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }
  const dmy = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2}|25\d{2})\b/)
  if (dmy) {
    return ymdFromParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  }
  const thai = s.match(
    /(\d{1,2})\s+(ม\.?\s*ค\.?|ก\.?\s*พ\.?|มี\.?\s*ค\.?|เม\.?\s*ย\.?|พ\.?\s*ค\.?|มิ\.?\s*ย\.?|ก\.?\s*ค\.?|ส\.?\s*ค\.?|ก\.?\s*ย\.?|ต\.?\s*ค\.?|พ\.?\s*ย\.?|ธ\.?\s*ค\.?|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(\d{4})/
  )
  if (thai) {
    const key = thai[2].replace(/\s+/g, '').replace(/\./g, '')
    const month = THAI_MONTH[key] || THAI_MONTH[thai[2].replace(/\s+/g, '')]
    if (month) return ymdFromParts(Number(thai[3]), month, Number(thai[1]))
  }
  return undefined
}

function extractTins(text: string): string[] {
  const found: string[] = []
  const add = (raw: string) => {
    const d = digitsTin13(raw)
    if (d.length !== 13 || found.includes(d)) return
    if (thaiTinChecksumOk(d) || found.length === 0) found.push(d)
  }
  const s = String(text || '')
  for (const m of s.match(/เลขประจำตัวผู้เสียภาษี[^\d]{0,24}([\d][\d\-\s]{11,22}[\d])/g) || []) {
    add(m)
  }
  for (const m of s.match(/\b\d{1,3}[- ]\d{3,4}[- ]\d{3,4}[- ]\d{1,4}\b/g) || []) {
    add(m)
  }
  for (const m of s.replace(/[^\d]/g, ' ').match(/\d{13}/g) || []) {
    add(m)
  }
  const checksumFirst = found.filter(thaiTinChecksumOk)
  return (checksumFirst.length ? checksumFirst : found).slice(0, 4)
}

function extractInvoiceNo(text: string): string | undefined {
  const s = String(text || '')
  const labeled = s.match(
    /(?:เลขที่(?:ใบกำกับ(?:ภาษี)?)?|No\.?|Invoice\s*No\.?|Tax\s*Invoice\s*No\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/]{2,40})/i
  )
  if (labeled) {
    const inv = labeled[1].trim()
    if (digitsTin13(inv).length !== 13) return inv
  }
  const common = s.match(/\b((?:INV|IV|TI|TAX)[\-/]?[A-Z0-9\-/]{3,30}|\d{8,}[A-Z]\d{3,})\b/i)
  if (!common) return undefined
  const inv = common[1].trim()
  if (digitsTin13(inv).length === 13) return undefined
  return inv
}

function extractSellerName(text: string, buyerName?: string): string | undefined {
  const s = String(text || '')
  const labeled = s.match(
    /(?:ผู้ขาย|ผู้จำหน่าย|ผู้ประกอบการ|Seller|Vendor)\s*[:\-]?\s*([^\n]{3,120})/i
  )
  if (labeled) {
    const name = labeled[1].replace(/\s{2,}/g, ' ').trim().slice(0, 200)
    if (name && !/ผู้ซื้อ|ลูกค้า|Buyer/i.test(name)) return name
  }
  const co = s.match(/(บริษัท\s+[^\n]{2,80}(?:จำกัด(?:\s*\(มหาชน\))?)?)/)
  if (co) {
    const name = co[1].replace(/\s{2,}/g, ' ').trim()
    const buyer = String(buyerName || '').trim()
    if (buyer && name.includes(buyer)) return undefined
    return name.slice(0, 200)
  }
  return undefined
}

function extractAmountNear(text: string, keywords: RegExp): number | undefined {
  const lines = String(text || '').split(/\r?\n/)
  for (const line of lines) {
    const idx = line.search(keywords)
    if (idx < 0) continue
    const v = moneyFromFragment(line.slice(idx))
    if (v != null) return v
  }
  const joined = String(text || '').replace(/\s+/g, ' ')
  const m = joined.match(keywords)
  if (!m || m.index == null) return undefined
  return moneyFromFragment(joined.slice(m.index, m.index + 96))
}

function collectBahtAmounts(text: string): number[] {
  const out: number[] = []
  for (const m of String(text || '').matchAll(/\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/g)) {
    const v = Number(m[0].replace(/,/g, ''))
    if (Number.isFinite(v) && v > 0 && v < 500_000_000) out.push(roundMoney2(v))
  }
  return out
}

/**
 * 키워드가 깨져도 하단 금액 3개가 공급가+VAT=합계·VAT≈7%이면 그 값을 씀.
 * OCR이 태국어 라벨을 잃어도 숫자열은 남는 경우가 많음.
 */
export function inferAmountsFromMoneySequence(text: string): {
  netAmount: number
  vatAmount: number
  totalAmount: number
} | null {
  const nums = collectBahtAmounts(text)
  if (nums.length < 2) return null
  const window = nums.slice(-8)
  for (let i = window.length - 1; i >= 2; i -= 1) {
    const totalAmount = window[i]
    const vatAmount = window[i - 1]
    const netAmount = window[i - 2]
    if (Math.abs(roundMoney2(netAmount + vatAmount) - totalAmount) > 0.05) continue
    if (vatAmount > 0 && purchaseTaxVatLooksWrong(netAmount, vatAmount)) continue
    return { netAmount, vatAmount, totalAmount }
  }
  for (let i = window.length - 1; i >= 1; i -= 1) {
    const netAmount = window[i - 1]
    const vatAmount = window[i]
    if (vatAmount > 0 && !purchaseTaxVatLooksWrong(netAmount, vatAmount)) {
      return { netAmount, vatAmount, totalAmount: roundMoney2(netAmount + vatAmount) }
    }
  }
  return null
}

function firstQueryValue(params: URLSearchParams, keys: string[]): string {
  for (const k of keys) {
    const v = params.get(k)
    if (v) return v
  }
  return ''
}

/** ใบกำกับภาษี QR·URL 페이로드 (공급자마다 형식이 다름). */
export function parsePurchaseTaxInvoiceQrPayload(raw: string): ExtractedPurchaseTaxInvoiceFields | null {
  const s = String(raw || '').trim()
  if (s.length < 8) return null
  let decoded = s
  try {
    decoded = decodeURIComponent(s)
  } catch {
    decoded = s
  }

  if (decoded.startsWith('{')) {
    try {
      const obj = JSON.parse(decoded) as Record<string, unknown>
      const row = parsePurchaseTaxInvoiceFromPdfText(
        [
          `เลขที่ ${obj.invoiceNo || obj.inv || obj.docNo || ''}`,
          `เลขประจำตัวผู้เสียภาษี ${obj.sellerTaxId || obj.tin || obj.taxId || ''}`,
          `วันที่ ${obj.docDate || obj.date || ''}`,
          `มูลค่า ${obj.netAmount || obj.amount || ''}`,
          `ภาษีมูลค่าเพิ่ม ${obj.vatAmount || obj.vat || ''}`,
          `รวมทั้งสิ้น ${obj.totalAmount || obj.total || ''}`,
        ].join('\n')
      )
      if (row) return row
    } catch {
      /* not json */
    }
  }

  try {
    const url = new URL(decoded)
    const q = url.searchParams
    const blob = [
      `เลขที่ ${firstQueryValue(q, ['invoiceNo', 'inv', 'docno', 'number', 'no'])}`,
      `เลขประจำตัวผู้เสียภาษี ${firstQueryValue(q, ['sellerTaxId', 'tin', 'taxId', 'nid', 'seller'])}`,
      `วันที่ ${firstQueryValue(q, ['date', 'docDate', 'issueDate'])}`,
      `มูลค่า ${firstQueryValue(q, ['net', 'base', 'amount', 'value'])}`,
          `ภาษีมูลค่าเพิ่ม ${firstQueryValue(q, ['vat', 'vatAmount', 'tax'])}`,
      `รวมทั้งสิ้น ${firstQueryValue(q, ['total', 'grand', 'sum'])}`,
      url.pathname,
    ].join('\n')
    const fromUrl = parsePurchaseTaxInvoiceFromPdfText(`${decoded}\n${blob}`)
    if (fromUrl && (fromUrl.sellerTaxId || fromUrl.invoiceNo || fromUrl.netAmount != null)) return fromUrl
  } catch {
    /* not a url */
  }

  const parts = decoded.split(/[|;,\t]/).map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const tins = parts.map((p) => digitsTin13(p)).filter((p) => p.length === 13 && thaiTinChecksumOk(p))
    const invoice = parts.find((p) => /[A-Za-z]/.test(p) && digitsTin13(p).length !== 13)
    const amounts = parts.map((p) => moneyFromFragment(p)).filter((n): n is number => n != null && n > 0)
    const date = parts.map((p) => parseTaxInvoiceDateFromText(p)).find(Boolean)
    const inferred = inferAmountsFromMoneySequence(parts.join(' '))
    const row: ExtractedPurchaseTaxInvoiceFields = {
      sellerTaxId: tins[0],
      invoiceNo: invoice ? invoice.slice(0, 80) : undefined,
      docDate: date,
      netAmount: inferred?.netAmount ?? amounts[0],
      vatAmount: inferred?.vatAmount ?? amounts[1],
      totalAmount: inferred?.totalAmount ?? amounts[2],
    }
    if (purchaseTaxInvoiceHasExtractedFields(row)) return row
  }

  return parsePurchaseTaxInvoiceFromPdfText(decoded)
}

/** 복합기 OCR/Tesseract 잡음: 세금번호 사이 공백, 전각 숫자, 숫자 속 O/l */
export function normalizeTaxInvoiceOcrText(text: string): string {
  let s = String(text || '').replace(/\u00a0/g, ' ')
  s = s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48))
  s = s.replace(/(\d)[Oo](\d)/g, '$10$2')
  s = s.replace(/(\d)[Il|](\d)/g, '$11$2')
  s = s.replace(/\b(\d(?:[\s\-]*\d){12})\b/g, (m) => m.replace(/[^\d]/g, ''))
  return s.replace(/[ \t]{2,}/g, ' ').trim()
}

/** 인쇄·전자 PDF처럼 글자층이 이미 있으면 Tesseract를 생략 */
export function pdfPageTextLooksPrinted(text: string): boolean {
  const s = String(text || '').trim()
  if (s.length < 80) return false
  const hasThai = /[\u0E00-\u0E7F]/.test(s)
  const hasKeyword = /ใบกำกับ|เลขที่|มูลค่า|ภาษีมูลค่าเพิ่ม|Invoice|VAT/i.test(s)
  return hasThai && hasKeyword
}

export function extractPurchaseTaxInvoiceFromScanText(
  text: string,
  hint?: PurchaseTaxInvoiceScanHint
): ExtractedPurchaseTaxInvoiceFields | null {
  const raw = String(text || '')
  const qrMatch = raw.match(/===QR===\s*([\s\S]*?)(?:===|$)/)
  const totalsMatch = raw.match(/===TOTALS[\s\S]*?===\s*([\s\S]*?)(?:===|$)/)
  const fromQr = qrMatch ? parsePurchaseTaxInvoiceQrPayload(qrMatch[1]) : null
  const fromText = parsePurchaseTaxInvoiceFromPdfText(raw, hint)
  const inferred = inferAmountsFromMoneySequence(totalsMatch?.[1] || raw)
  let merged = mergePurchaseTaxInvoiceExtract(fromQr, fromText)
  if (inferred) {
    const amountsWeak =
      !merged ||
      merged.netAmount == null ||
      merged.vatAmount == null ||
      (merged.vatAmount > 0 && purchaseTaxVatLooksWrong(merged.netAmount, merged.vatAmount))
    if (amountsWeak) {
      merged = mergePurchaseTaxInvoiceExtract(
        { netAmount: inferred.netAmount, vatAmount: inferred.vatAmount, totalAmount: inferred.totalAmount },
        merged
      )
    }
  }
  return merged ? repairExtractedPurchaseTaxInvoice(merged, hint) : null
}

export function parsePurchaseTaxInvoiceFromPdfText(
  text: string,
  hint?: PurchaseTaxInvoiceScanHint
): ExtractedPurchaseTaxInvoiceFields | null {
  const raw = normalizeTaxInvoiceOcrText(text)
  if (raw.length < 40) return null
  const buyerTin = digitsTin13(hint?.buyerTaxId)
  const tins = extractTins(raw)
  const sellerTaxId = tins.find((tin) => tin !== buyerTin) || (tins[0] && tins[0] !== buyerTin ? tins[0] : undefined)
  const netAmount =
    extractAmountNear(raw, /มูลค่าสินค้า|มูลค่า(?!เพิ่ม)|ฐานภาษี|Taxable|Sub\s*total|Net\s*amount/i) ??
    extractAmountNear(raw, /ก่อนภาษี|ก่อน VAT/i)
  const vatAmount = extractAmountNear(raw, /ภาษีมูลค่าเพิ่ม|VAT\s*7|Vat amount|ภาษี\s*7/i)
  const totalAmount = extractAmountNear(raw, /รวมทั้งสิ้น|ยอดรวมสุทธิ|Grand\s*total|Amount\s*due/i)
  const inferred = inferAmountsFromMoneySequence(raw)
  const row: ExtractedPurchaseTaxInvoiceFields = {
    docDate: parseTaxInvoiceDateFromText(raw),
    invoiceNo: extractInvoiceNo(raw),
    sellerName: extractSellerName(raw, hint?.buyerName),
    sellerTaxId: sellerTaxId && sellerTaxId.length === 13 ? sellerTaxId : undefined,
    netAmount: netAmount ?? inferred?.netAmount,
    vatAmount: vatAmount ?? inferred?.vatAmount,
    totalAmount: totalAmount ?? inferred?.totalAmount,
    isCopy: /สำเนา|true copy|duplicate/i.test(raw) && !/ต้นฉบับ/.test(raw),
  }
  return purchaseTaxInvoiceHasExtractedFields(row) ? row : null
}

/** e-Tax/인쇄 PDF처럼 텍스트층이 충분하고 핵심 필드가 맞으면 Vision을 생략해도 됨. */
export function purchaseTaxInvoiceTextExtractIsComplete(
  row: ExtractedPurchaseTaxInvoiceFields | null | undefined,
  hint?: PurchaseTaxInvoiceScanHint
): boolean {
  if (!row?.invoiceNo || !row.sellerTaxId) return false
  if (row.sellerTaxId.length !== 13) return false
  const buyerTin = digitsTin13(hint?.buyerTaxId)
  if (buyerTin && row.sellerTaxId === buyerTin) return false
  if (row.netAmount == null || row.vatAmount == null) return false
  if (row.vatAmount > 0 && purchaseTaxVatLooksWrong(row.netAmount, row.vatAmount)) return false
  return true
}

export function mergePurchaseTaxInvoiceExtract(
  primary: ExtractedPurchaseTaxInvoiceFields | null | undefined,
  secondary: ExtractedPurchaseTaxInvoiceFields | null | undefined
): ExtractedPurchaseTaxInvoiceFields | null {
  if (!primary && !secondary) return null
  const row: ExtractedPurchaseTaxInvoiceFields = {
    docDate: primary?.docDate || secondary?.docDate,
    invoiceNo: primary?.invoiceNo || secondary?.invoiceNo,
    sellerName: primary?.sellerName || secondary?.sellerName,
    sellerTaxId: primary?.sellerTaxId || secondary?.sellerTaxId,
    sellerBranch: primary?.sellerBranch || secondary?.sellerBranch,
    netAmount: primary?.netAmount ?? secondary?.netAmount,
    vatAmount: primary?.vatAmount ?? secondary?.vatAmount,
    totalAmount: primary?.totalAmount ?? secondary?.totalAmount,
    isCopy: primary?.isCopy === true || secondary?.isCopy === true,
  }
  return purchaseTaxInvoiceHasExtractedFields(row) ? row : null
}

/**
 * Vision/텍스트 결과를 세금계산서 규칙으로 보정.
 * 매수자 TIN을 판매자로 넣었거나, 부가세 포함액을 공급가로 넣은 경우를 바로잡음.
 */
export function repairExtractedPurchaseTaxInvoice(
  row: ExtractedPurchaseTaxInvoiceFields,
  hint?: PurchaseTaxInvoiceScanHint
): ExtractedPurchaseTaxInvoiceFields {
  const buyerTin = digitsTin13(hint?.buyerTaxId)
  let sellerTaxId = row.sellerTaxId ? digitsTin13(row.sellerTaxId) : undefined
  if (sellerTaxId?.length !== 13) sellerTaxId = undefined
  if (buyerTin && sellerTaxId === buyerTin) sellerTaxId = undefined

  let netAmount = row.netAmount
  let vatAmount = row.vatAmount
  let totalAmount = row.totalAmount

  if (netAmount != null && vatAmount != null && totalAmount == null) {
    totalAmount = roundMoney2(netAmount + vatAmount)
  }
  if (netAmount != null && totalAmount != null && vatAmount == null) {
    vatAmount = roundMoney2(Math.max(0, totalAmount - netAmount))
  }
  if (vatAmount != null && totalAmount != null && netAmount == null) {
    netAmount = roundMoney2(Math.max(0, totalAmount - vatAmount))
  }

  if (netAmount != null && vatAmount != null && vatAmount > 0 && purchaseTaxVatLooksWrong(netAmount, vatAmount)) {
    const excl = roundMoney2(netAmount / 1.07)
    if (!purchaseTaxVatLooksWrong(excl, vatAmount)) {
      netAmount = excl
      if (totalAmount == null) totalAmount = roundMoney2(netAmount + vatAmount)
    } else if (totalAmount != null && !purchaseTaxVatLooksWrong(roundMoney2(totalAmount - vatAmount), vatAmount)) {
      netAmount = roundMoney2(totalAmount - vatAmount)
    }
  }

  if (netAmount != null && vatAmount != null && totalAmount != null) {
    const sum = roundMoney2(netAmount + vatAmount)
    if (Math.abs(sum - totalAmount) > 0.05 && Math.abs(roundMoney2(totalAmount - vatAmount) - netAmount) > 0.05) {
      if (!purchaseTaxVatLooksWrong(netAmount, vatAmount)) {
        totalAmount = sum
      }
    }
  }

  return {
    ...row,
    sellerTaxId,
    netAmount,
    vatAmount,
    totalAmount,
  }
}

export function buildTaxInvoiceVisionSystemPrompt(): string {
  return [
    'You are a dedicated Thai tax-invoice (ใบกำกับภาษี / ใบกำกับภาษีอย่างย่อ) extractor for the ภาษีซื้อ register.',
    'Reply JSON only: {"invoices":[{"docDate":"YYYY-MM-DD"|null,"invoiceNo":string|null,"sellerName":string|null,"sellerTaxId":string|null,"sellerBranch":"สำนักงานใหญ่"|"สาขา 00001"|null,"netAmount":number|null,"vatAmount":number|null,"totalAmount":number|null,"isCopy":boolean}]}.',
    'The FIRST image is the FULL page — that is the source of truth. Extra images are optional zooms of header or totals.',
    'Seller (ผู้ขาย / ผู้จำหน่าย / ผู้ประกอบการ) issued the invoice (logo, top block). Buyer (ผู้ซื้อ / ลูกค้า) is our restaurant — NEVER put buyer TIN/name as seller.',
    'Rules: (1) Return every distinct original ต้นฉบับ on the page (1 or 2). (2) TIN is 13 digits. (3) sellerBranch = สำนักงานใหญ่ if head office/00000, else สาขา + 5-digit code. (4) netAmount = มูลค่า/ฐานภาษี excluding VAT; mixed VATable+exempt → VATable base only. (5) vatAmount is baht not 7%. Cross-check vat ≈ round(net*0.07,2) unless exempt 0. (6) docDate Gregorian; พ.ศ. 2569→2026. (7) isCopy=true for สำเนา/copy. (8) Platform/bank fee invoices: net = fee before VAT, not GMV. (9) JSON numbers not strings. (10) Read every digit; prefer printed bottom totals over summing line items.',
  ].join(' ')
}

export function buildTaxInvoiceVisionUserPrompt(hint?: PurchaseTaxInvoiceScanHint): string {
  const parts = [
    'Read every ใบกำกับภาษี on these images for the ภาษีซื้อ register. First image = full page.',
  ]
  const buyerTin = digitsTin13(hint?.buyerTaxId)
  if (buyerTin.length === 13) {
    parts.push(`Buyer TIN (ผู้ซื้อ, our company) is ${buyerTin}. If you see this TIN it is the buyer, never sellerTaxId.`)
  }
  const buyerName = String(hint?.buyerName || '').trim()
  if (buyerName) {
    parts.push(`Buyer / store name hint: ${buyerName.slice(0, 80)}. Do not use this as sellerName.`)
  }
  const pageText = String(hint?.pageText || '').trim().slice(0, 4000)
  if (pageText.length >= 20) {
    parts.push(
      `PDF text layer (may be incomplete or wrong; image wins if they disagree):\n${pageText}`
    )
  }
  return parts.join('\n')
}
