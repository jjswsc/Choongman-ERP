/**
 * ใบกำกับภาษีซื้อ 전용 스캔 파이프라인 (GPT 없음).
 * (1) PDF 글자층 (2) QR (jsQR·URL·파이프) (3) 브라우저 태국어 OCR (4) 매수자 TIN 힌트·금액 교차검증.
 */

import { formatSellerBranch, compactPurchaseInvoiceToken, digitsTin13, fixOcrInvoiceLetterIPrefix, isLikelyTaxInvoiceCopy, isTruncatedShopeeInvoiceNo, looksLikeJunkSellerName, normalizeShopeeInvoiceBlob, purchaseInvoiceNosAreSameDocument, purchaseTaxInvoiceHasExtractedFields, purchaseTaxVatLooksWrong, shopeeUniqueInvoiceTail, thaiTinChecksumOk, trimPurchaseTaxSellerName, type ExtractedPurchaseTaxInvoiceFields } from '@/lib/purchase-tax-invoice-core'
import { roundMoney2 } from '@/lib/invoice-vat-total'
import {
  findInvoiceTokenInText,
  invoiceMatchesVendorHint,
  purchaseTaxLayoutWeakRegions,
  restoreInvoiceWithVendorHint,
  type LayoutExtract,
  type VendorInvoiceHint,
} from '@/lib/purchase-tax-invoice-layout'
import { netLooksImplausiblySmallForTin } from '@/lib/purchase-tax-invoice-seller-lookup'

export type PurchaseTaxInvoiceScanHint = {
  buyerTaxId?: string
  buyerName?: string
  pageText?: string
  taxMonth?: string
  vendorHints?: Map<string, VendorInvoiceHint>
  learnedNetsByTin?: Record<string, number[]>
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

export { thaiTinChecksumOk }

function moneyFromFragment(raw: string): number | undefined {
  const s = String(raw || '').replace(/\b7(?:\.0+)?\s*%/g, ' ')
  const money = s.match(/\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/)
  if (!money) return undefined
  const v = Number(money[0].replace(/,/g, ''))
  if (!Number.isFinite(v) || v < 0 || v >= 500_000_000) return undefined
  return roundMoney2(v)
}

function ymdFromParts(year: number, month: number, day: number): string | undefined {
  let y = year
  if (y > 2100 && y < 100000) {
    const last4 = y % 10000
    if (last4 >= 2000 && last4 <= 2100) y = last4
  }
  if (y < 100) y = y >= 50 ? 2500 + y - 543 : 2000 + y
  if (y >= 2400) y -= 543
  if (y < 1990 || y > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** OCR이 2565/2022처럼 연도만 어긋난 경우 조회 연도로 맞춤. 월·일은 유지. */
export function snapDocDateYearToTaxPeriod(ymd: string | undefined, taxMonth?: string): string | undefined {
  const date = String(ymd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ymd
  const wantY = Number(String(taxMonth || '').slice(0, 4))
  const y = Number(date.slice(0, 4))
  if (!Number.isFinite(wantY) || wantY < 1990 || wantY > 2100) return date
  const delta = Math.abs(y - wantY)
  if (delta >= 2) return `${String(wantY).padStart(4, '0')}${date.slice(4)}`
  return date
}

const EN_MONTH: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

export function parseTaxInvoiceDateFromText(text: string): string | undefined {
  const lines = String(text || '').split(/\r?\n/)
  const fromLine = (line: string): string | undefined => parseTaxInvoiceDateFromFragment(line)
  for (const line of lines) {
    if (!/วันที่|\bDATE\b/i.test(line)) continue
    if (/เริ่มใช้|ครบกำหนด|due\s*date|วันที่ครบ/i.test(line)) continue
    const d = fromLine(line)
    if (d) return d
  }
  for (const line of lines) {
    if (/เริ่มใช้|Rev\.?\s*:|FM-AC/i.test(line)) continue
    const d = fromLine(line)
    if (d) return d
  }
  return parseTaxInvoiceDateFromFragment(String(text || ''))
}

function parseTaxInvoiceDateFromFragment(s: string): string | undefined {
  const en = s.match(
    /\b(\d{1,2})[.\-/\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[.\-/\s]+(\d{2,4})\b/i
  )
  if (en) {
    const month = EN_MONTH[en[2].slice(0, 3).toLowerCase()]
    if (month) return ymdFromParts(Number(en[3]), month, Number(en[1]))
  }
  const iso = s.match(/\b(20\d{2}|25\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/)
  if (iso) {
    return ymdFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }
  const dmy = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4,5})\b/)
  if (dmy) {
    return ymdFromParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  }
  const dmy2 = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2})\b/)
  if (dmy2) {
    return ymdFromParts(Number(dmy2[3]), Number(dmy2[2]), Number(dmy2[1]))
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

function mapOcrDigitChar(ch: string): string {
  if (/[0-9]/.test(ch)) return ch
  if (/[OoD]/.test(ch)) return '0'
  if (/[Il|]/.test(ch)) return '1'
  if (/[Zz]/.test(ch)) return '2'
  if (/[Ss]/.test(ch)) return '5'
  if (/[Gg]/.test(ch)) return '6'
  if (/[Bb]/.test(ch)) return '8'
  return ''
}

/** OCR이 O/l/I/S 로 읽은 13자리를 체크디짓이 맞는 TIN만 남김. 체크디짓만 임의로 고치지는 않음. */
export function tinsFromOcrDigitBlob(raw: string): string[] {
  let digits = ''
  for (const ch of String(raw || '')) {
    const d = mapOcrDigitChar(ch)
    if (d) digits += d
  }
  const found: string[] = []
  for (let i = 0; i + 13 <= digits.length; i += 1) {
    const cand = digits.slice(i, i + 13)
    if (thaiTinChecksumOk(cand) && !found.includes(cand)) found.push(cand)
  }
  return found
}

function extractTins(text: string): string[] {
  const found: string[] = []
  const add = (raw: string) => {
    const cands = tinsFromOcrDigitBlob(raw)
    for (const d of cands.length ? cands : [digitsTin13(raw)]) {
      if (d.length !== 13 || found.includes(d) || !thaiTinChecksumOk(d)) continue
      found.push(d)
    }
  }
  const s = String(text || '')
  for (const m of s.match(/เลขประจำตัวผู้เสียภาษี[^\dA-Za-zOoIl|]{0,24}([\dA-Za-zOoIl|][\dA-Za-zOoIl|\-\s]{11,22}[\dA-Za-zOoIl|])/g) || []) {
    add(m)
  }
  for (const m of s.match(/\b\d{1,3}[- ]\d{3,4}[- ]\d{3,4}[- ]\d{1,4}\b/g) || []) {
    add(m)
  }
  for (const m of s.replace(/[^\d]/g, ' ').match(/\d{13}/g) || []) {
    add(m)
  }
  for (const m of s.match(/[0-9A-Za-zOoIl|](?:[0-9A-Za-zOoIl|\-\s]{10,24})[0-9A-Za-zOoIl|]/g) || []) {
    add(m)
  }
  return found.filter(thaiTinChecksumOk).slice(0, 4)
}

function compactInvoiceToken(raw: string): string {
  return compactPurchaseInvoiceToken(raw)
}

/** OCR이 번호 끝의 ! 를 1로 읽은 경우. I→1 치환은 INV/IM 접두를 깨므로 하지 않음. */
function ocrFixDigitsInInvoiceBlob(raw: string): string {
  return String(raw || '').replace(/!/g, '1')
}

const INVOICE_JUNK_TOKEN_RE = /contact|customer|taxrex|invpice|^nsee$|^find$|^fad$/i

/** OCR이 제목(Tax Invoice)이나 주소 조각을 번호로 넣은 경우 */
export function invoiceNoLooksPlausible(raw: unknown): boolean {
  const inv = compactInvoiceToken(String(raw || ''))
  if (!inv) return false
  const compact = inv.replace(/[^A-Za-z0-9]/g, '')
  if (compact.length < 2) return false
  const lower = compact.toLowerCase()
  if (!/\d/.test(compact)) return false
  if (INVOICE_JUNK_TOKEN_RE.test(lower)) return false
  if (/^(tax)?invoice/.test(lower)) return false
  if (/(tax)?invoice/.test(lower) && !/^inv-?\d/i.test(inv)) return false
  if (/^(deliveryorder|creditadvice|document|description|quantity|unitprice|amount|number|date)/.test(lower)) return false
  if (/plzb/i.test(compact)) return false
  if (/^GD-\d{1,4}-\d{1,4}$/i.test(inv)) return false
  if (isTruncatedShopeeInvoiceNo(inv)) return false
  if (/^IM20\d{0,11}$/i.test(compact) && compact.length < 16) return false
  if (!/[A-Za-z]/.test(compact) && compact.length < 4) return false
  return true
}

function cleanInvoiceNo(raw: string): string | undefined {
  const inv = compactInvoiceToken(raw)
  if (!inv) return undefined
  const onlyDigits = inv.replace(/\D/g, '')
  if (!/[A-Za-z]/.test(inv) && onlyDigits.length === 13 && /^0\d{12}$/.test(onlyDigits)) return undefined
  if (!/[A-Za-z]/.test(inv) && /^0\d{8,9}$/.test(onlyDigits)) return undefined
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(inv) && parseTaxInvoiceDateFromText(inv)) return undefined
  if (!/^[A-Z0-9][A-Z0-9\-/]{1,64}$/i.test(inv)) return undefined
  if (!invoiceNoLooksPlausible(inv)) return undefined
  return inv.slice(0, 80)
}

const PLATFORM_INVOICE_RE =
  /\b(TRS[A-Z]{2,10}\s*[O0]{2}\s*-\s*\d{5}\s*-\s*\d{6}\s*-\s*\d{5,8}|IM\s*20\d{2}\s*\d{10,12}|LMRN\s*[A-Z0-9]{8,20}|\d{6}\s*[A-EFH]\s*\d{7,14}|INV\s*-\s*\d{8,14}(?:\s*-\s*\d{2,4})?)\b/i

function platformInvoiceBlob(raw: string): string {
  return normalizeShopeeInvoiceBlob(ocrFixDigitsInInvoiceBlob(String(raw || '')))
}

function formatRecoveredShopeeInvoice(compact: string): string | undefined {
  const s = platformInvoiceBlob(compact)
  const m =
    s.match(/TRS[A-Z]{2,10}00-?(\d{5})-?(\d{6})-?(\d{6})/i) ||
    s.match(/TRS[A-Z]{2,10}00-?(\d{5})-?(\d{6})-?(\d{5,8})/i)
  if (!m) return undefined
  const prefix = s.match(/TRS[A-Z]{2,10}00/i)?.[0]
  if (!prefix) return undefined
  return cleanInvoiceNo(`${prefix.toUpperCase()}-${m[1]}-${m[2]}-${m[3]}`)
}

function shopeeYearYyFromText(text: string, taxMonth?: string): string {
  const fromMonth = grabYmFromTaxMonth(taxMonth).slice(2, 4)
  if (fromMonth) return fromMonth
  const d = parseTaxInvoiceDateFromText(text)
  if (d) return d.slice(2, 4)
  return ''
}

/** `0821-001305` — 쇼피 둘째 줄. 주소 번지 `60/1` 과는 자릿수가 다름 */
function shopeeMdSeqFromText(text: string): { md: string; seq: string } | undefined {
  const m = String(text || '').match(/\b((?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))-(\d{5,8})\b/)
  if (!m) return undefined
  return { md: m[1], seq: m[2] }
}

function recoverShopeeFromHeadAndMd(
  text: string,
  taxMonth?: string,
  headRaw?: string
): string | undefined {
  const hit = shopeeMdSeqFromText(text)
  const yy = shopeeYearYyFromText(text, taxMonth)
  if (!hit || !yy) return undefined
  const blob = platformInvoiceBlob(headRaw || text)
  const prefix = blob.match(/TRS[A-Z]{2,10}00/i)?.[0]
  if (!prefix) return undefined
  return formatRecoveredShopeeInvoice(`${prefix.toUpperCase()}-00000-${yy}${hit.md}-${hit.seq}`)
}

function recoverShopeeInvoiceNo(text: string, taxMonth?: string): string | undefined {
  const compact = platformInvoiceBlob(text)
  const full = formatRecoveredShopeeInvoice(compact)
  if (full) return full

  // `TRSPEFHM00-00000026` 다음 줄 `0821-001305` → `260821-001305`
  const raw = String(text || '')
  const head = raw.match(/TRS[A-Z]{2,10}[O0]{2}-(\d{5})-?(\d{0,8})/i)
  if (head) {
    const prefix = platformInvoiceBlob(head[0]).match(/TRS[A-Z]{2,10}00/i)?.[0]
    const mid = head[2]
    const after = raw.slice(raw.indexOf(head[0]) + head[0].length).slice(0, 800)
    const yy = shopeeYearYyFromText(raw, taxMonth)
    if (prefix && mid.length === 0) {
      const ymd = after.match(/(\d{6})-(\d{5,8})/)
      if (ymd) {
        const joined = formatRecoveredShopeeInvoice(
          `${prefix.toUpperCase()}-${head[1]}-${ymd[1]}-${ymd[2]}`
        )
        if (joined) return joined
      }
      const md = after.match(/(\d{4})-(\d{5,8})/)
      if (md && yy) {
        const joined = formatRecoveredShopeeInvoice(
          `${prefix.toUpperCase()}-${head[1]}-${yy}${md[1]}-${md[2]}`
        )
        if (joined) return joined
      }
    }
    if (prefix && mid.length > 0 && mid.length < 6) {
      const tail = after.match(/(\d{4})-(\d{5,8})/)
      if (tail) {
        const yearFromMid = /^(?:2[6-9]|69|70)$/.test(mid.slice(-2)) && mid.length <= 3
        const year = (yearFromMid ? mid.slice(-2) : yy).slice(-2)
        if (year.length === 2) {
          const joined = formatRecoveredShopeeInvoice(
            `${prefix.toUpperCase()}-${head[1]}-${year}${tail[1]}-${tail[2]}`
          )
          if (joined) return joined
        }
      }
    }
    if (prefix && mid.length === 6) {
      const last = after.match(/^\s*-?\s*(\d{5,8})\b/) || after.match(/\n\s*(\d{5,8})\b/)
      if (last) {
        const joined = formatRecoveredShopeeInvoice(`${prefix.toUpperCase()}-${head[1]}-${mid}-${last[1]}`)
        if (joined) return joined
      }
    }
  }

  const mashed = recoverShopeeFromHeadAndMd(raw, taxMonth)
  if (mashed) return mashed

  const prefix = compact.match(/TRS[A-Z]{2,10}00-?/i)
  const tail = compact.match(/(\d{5})-(\d{6})-(\d{5,8})/)
  if (prefix && tail) {
    return formatRecoveredShopeeInvoice(
      `${prefix[0].replace(/-$/, '').toUpperCase()}-${tail[1]}-${tail[2]}-${tail[3]}`
    )
  }
  return undefined
}

function grabYmFromTaxMonth(taxMonth?: string): string {
  return String(taxMonth || '').replace(/-/g, '').slice(0, 6)
}

function recoverGrabInvoiceNo(text: string, sellerTaxId?: string, taxMonth?: string): string | undefined {
  const compact = platformInvoiceBlob(text)
  const ym = grabYmFromTaxMonth(taxMonth)
  const prefixed = [...compact.matchAll(/[IT]M20\d{12}/gi)].map((m) => `IM${m[0].replace(/^[IT]M/i, '')}`)
  const grabTin = sellerTaxId === '0105556090377' || compact.includes('0105556090377')
  const bodies = grabTin ? [...compact.matchAll(/20\d{12}/g)].map((m) => `IM${m[0]}`) : []
  const all = [...prefixed, ...bodies]
  const pick = (ym && all.find((n) => n.slice(2, 8) === ym)) || prefixed[0] || (grabTin ? bodies[0] : undefined)
  if (pick) return cleanInvoiceNo(pick)
  if (!grabTin) return undefined
  const partial = compact.match(/[IT]M(20\d{7,11})/i)
  if (!partial) return undefined
  const rest = compact.slice(compact.indexOf(partial[0]) + partial[0].length).replace(/\D/g, '')
  const digits = (partial[1] + rest).slice(0, 14)
  if (digits.length === 14) return cleanInvoiceNo(`IM${digits}`)
  return undefined
}

function looksLikeKasikornInvoiceNo(raw: string): boolean {
  const s = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return /^\d{6}[EFH]\d{4,14}$/.test(s) || /^370\d{6}W\d{4,8}$/.test(s)
}

function recoverKasikornInvoiceNo(text: string): string | undefined {
  const compact = platformInvoiceBlob(text).replace(/O/g, '0')
  const wHits = [...compact.matchAll(/370\d{6}W\d{4,8}/gi)].map((m) => m[0].toUpperCase())
  wHits.sort((a, b) => b.length - a.length)
  if (wHits[0]) return cleanInvoiceNo(wHits[0])
  const hits = [...compact.matchAll(/\d{6}[EFH]\d{7,14}/gi)].map((m) => m[0].toUpperCase())
  hits.sort((a, b) => b.length - a.length)
  if (hits[0]) return cleanInvoiceNo(hits[0])
  const spaced = String(text || '').match(/\b(\d{6})\s*([EFH])\s*(\d{7,14})\b/i)
  if (spaced) return cleanInvoiceNo(`${spaced[1]}${spaced[2].toUpperCase()}${spaced[3]}`)
  const labeled = String(text || '').match(/เลขที่เอกสาร\s*[:.\-]?\s*([0-9A-Za-zOo]{12,22})/i)
  if (labeled) {
    const rec = recoverKasikornInvoiceNo(labeled[1])
    if (rec) return rec
    const cleaned = cleanInvoiceNo(labeled[1])
    if (cleaned && looksLikeKasikornInvoiceNo(cleaned)) return cleaned
  }
  return undefined
}

const INVOICE_LABEL_RE =
  /(?:เอกสารเลขที่|เลขที่(?:เอกสาร|ใบกำกับ(?:ภาษี)?)?|เลขท[ีิ]|Invoice\s*No\.?|Tax\s*Invoice\s*No\.?|Doc(?:ument)?\s*No\.?|\bNo\.?(?=\s*[:#]?[A-Z0-9]))\s*[:#.\-]*/gi

const INVOICE_LINE_STOP_RE =
  /วันที่|บริษัท|ห้างหุ้น|ห้าง|เลขประจำ|มูลค่า|ภาษีมูลค่า|ผู้ซื้อ|ผู้ขาย|สำนักงาน|สาขา\s*\d|Tax\s*ID|\bTIN\b/i

const OFFICE_INVOICE_RE =
  /\b((?:INV|IVT|NX|NC|RV|SI|CS|DCI|DOI|TIT|INCT|IV|1V|ID|TI|ABB|RT)[\-/]?[A-Z0-9\-/ ]{2,48}|[A-Z]{5,10}\d{12,28}|370\d{6}W\d{4,8}|\d{6}[EFH]\d{4,14}|\d{7,12})\b/gi

function officeInvoiceRank(inv: string): number {
  const s = String(inv || '')
  if (/^(INV|IVT|NX|NC|RV|SI|CS|DCI|DOI|TIT|INCT|IV|1V|ID)[-/]?/i.test(s)) return 8
  if (looksLikeKasikornInvoiceNo(s)) return 8
  if (/^[A-Z]{5,12}\d{12,}$/i.test(s.replace(/[^A-Za-z0-9]/g, ''))) return 7
  if (/^0\d{8,9}$/.test(s.replace(/\D/g, '')) && !/[A-Za-z]/.test(s)) return 0
  if (/[A-Za-z]/.test(s)) return 4
  return 1
}

function attachOfficePrefix(text: string, inv: string): string | undefined {
  if (!inv || /[A-Za-z]/.test(inv)) return undefined
  const esc = inv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = String(text || '').match(new RegExp(`\\b(INV|IVT|IV|NX|NC|RV|SI|CS|DCI|DOI|TI|ID|INCT)[\\s\\-]*${esc}\\b`, 'i'))
  if (!m) return undefined
  const prefix = m[1].toUpperCase()
  const joined = joinOfficePrefix(prefix, inv)
  return cleanInvoiceNo(joined)
}

/** IV-016119 은 하이픈, IV690819-0637 처럼 불기 연월이 본문이면 붙여 쓴다 */
function joinOfficePrefix(prefix: string, inv: string): string {
  const p = prefix.toUpperCase()
  const body = String(inv || '').replace(/^\-+/, '')
  if (/^(INV|IVT|IV|DCI|DOI|ID|INCT)$/.test(p)) {
    if (body.includes('-') || ((p === 'ID' || p === 'INCT') && body.includes('/'))) return `${p}${body}`
    if (p === 'IV' && /^(6\d|7[0-2])\d{4,}$/.test(body.replace(/\D/g, ''))) return `${p}${body}`
    if (p === 'ID' || p === 'INCT') return `${p}${body}`
    return `${p}-${body}`
  }
  return `${p}${body}`
}

/** RV26907… = AD연도 앞자리 2 + 불기 뒤 2자리 + 월. OCR이 연도만 어긋나면 조회월로 맞춘다. */
function snapRvInvoiceToTaxMonth(inv: string, taxMonth?: string): string {
  const ym = String(taxMonth || '')
  const year = Number(ym.slice(0, 4))
  const month = ym.slice(5, 7)
  if (!year || !/^\d{2}$/.test(month)) return inv
  const beYy = String(year + 543).slice(-2)
  const hit = String(inv || '').match(/^(RV)2(\d{2})(0[1-9]|1[0-2])(\d{4,})$/i)
  if (!hit || hit[3] !== month || hit[2] === beYy) return inv
  return `${hit[1].toUpperCase()}2${beYy}${hit[3]}${hit[4]}`
}

function invoiceNoFromLabeledSlice(slice: string): string | undefined {
  const sameLine = slice.split(/\r?\n/, 1)[0] || ''
  const cut = sameLine
    .replace(/^(?:เอกสาร|ใบกำกับ(?:ภาษี)?|Invoice)\s*/i, '')
    .split(INVOICE_LINE_STOP_RE)[0]
  const inv = cleanInvoiceNo(cut)
  if (inv) return inv
  const next = slice.match(/^(?:[^\S\r\n]*)\r?\n\s*([^\r\n]{2,80})/)
  if (!next) return undefined
  return cleanInvoiceNo(next[1].split(INVOICE_LINE_STOP_RE)[0])
}

function extractLabeledInvoiceNo(s: string): string | undefined {
  INVOICE_LABEL_RE.lastIndex = 0
  const found: string[] = []
  let m: RegExpExecArray | null
  while ((m = INVOICE_LABEL_RE.exec(s))) {
    const inv = invoiceNoFromLabeledSlice(s.slice(m.index + m[0].length))
    if (inv && !found.includes(inv)) found.push(inv)
  }
  found.sort((a, b) => officeInvoiceRank(b) - officeInvoiceRank(a) || b.length - a.length)
  return found[0]
}

function firstOfficeInvoiceNo(s: string): string | undefined {
  OFFICE_INVOICE_RE.lastIndex = 0
  const found: string[] = []
  let m: RegExpExecArray | null
  while ((m = OFFICE_INVOICE_RE.exec(s))) {
    const inv = cleanInvoiceNo(m[1])
    if (inv && !found.includes(inv)) found.push(inv)
  }
  found.sort((a, b) => officeInvoiceRank(b) - officeInvoiceRank(a) || b.length - a.length)
  return found[0]
}

function invoiceDigitsLookLikeTinFragment(inv: string, tins: string[]): boolean {
  if (!inv || /[A-Za-z]/.test(inv)) return false
  const d = inv.replace(/\D/g, '')
  if (d.length < 8) return false
  return tins.some((tin) => {
    const t = digitsTin13(tin)
    if (t.length !== 13) return false
    return t === d || t.includes(d) || t.slice(1) === d
  })
}

function extractInvoiceNo(
  text: string,
  sellerTaxId?: string,
  taxMonth?: string,
  buyerTaxId?: string
): string | undefined {
  const s = String(text || '')
  const compact = platformInvoiceBlob(s)
  const tins = [...extractTins(s), digitsTin13(sellerTaxId), digitsTin13(buyerTaxId)].filter((t) => t.length === 13)
  const take = (inv?: string) => (inv && !invoiceDigitsLookLikeTinFragment(inv, tins) ? inv : undefined)
  const recovered =
    recoverShopeeInvoiceNo(s, taxMonth) ||
    recoverGrabInvoiceNo(s, sellerTaxId, taxMonth) ||
    recoverKasikornInvoiceNo(s)
  if (take(recovered)) return recovered
  const platform = s.match(PLATFORM_INVOICE_RE) || compact.match(PLATFORM_INVOICE_RE)
  if (platform) {
    const inv = take(cleanInvoiceNo(platformInvoiceBlob(platform[1])))
    if (inv) return inv
  }
  const office = take(extractLabeledInvoiceNo(s)) || take(firstOfficeInvoiceNo(s))
  if (!office) return undefined
  const prefixed = attachOfficePrefix(s, office) || office
  return snapRvInvoiceToTaxMonth(prefixed, taxMonth)
}

const KNOWN_INVOICE_SELLERS: Array<{ re: RegExp; tin: string; name: string }> = [
  { re: /^TRS[A-Z]{2,10}00-/i, tin: '0105558019581', name: 'บริษัท ช้อปปี้ (ประเทศไทย) จำกัด' },
  { re: /^IM20\d{12}$/i, tin: '0105556090377', name: 'บริษัท แกร็บแท็กซี่ (ประเทศไทย) จำกัด' },
  { re: /^LMRN/i, tin: '0105562160721', name: 'บริษัท ไลน์แมน (ประเทศไทย) จำกัด' },
  { re: /^\d{6}[EFH]\d+$/i, tin: '0107536000315', name: 'บริษัท ธนาคารกสิกรไทย จำกัด (มหาชน)' },
  { re: /^370\d+W\d+$/i, tin: '0107536000315', name: 'บริษัท ธนาคารกสิกรไทย จำกัด (มหาชน)' },
  { re: /^INV-\d{11}$/i, tin: '0105559082715', name: 'บริษัท โพลาร์ แบร์ มิชชั่น จำกัด' },
  { re: /^INV-\d{8}-\d{2,4}$/i, tin: '0135564019457', name: 'บริษัท ไทย แอ็กโกร เฟรช จำกัด' },
  { re: /^(?:26|69)\d{5}$/, tin: '0105550102497', name: 'บริษัท จีดูบัง (เอเชีย) จำกัด' },
  { re: /^RT-\d{8}\d*$/i, tin: '0125569006965', name: 'บริษัท ร่ำรวย แพ็คเกจจิ้ง จำกัด' },
]

const KNOWN_TIN_SELLER_NAMES: Record<string, string> = {
  ...Object.fromEntries(KNOWN_INVOICE_SELLERS.map((row) => [row.tin, row.name])),
  '0105533116116': 'บริษัท จี.ซี.เอส. เซลส์ แอนด์ เซอร์วิส จำกัด',
  '0105550102497': 'บริษัท จีดูบัง (เอเชีย) จำกัด',
  '0605565002677': 'บริษัท เคลฟเวอร์ กู๊ดส์ จำกัด',
  '0105561016821': 'บริษัท โปโลเน็กซ์ จำกัด',
  '0107561000374': 'บริษัท อาร์ แอนด์ บี ฟู้ด ซัพพลาย จำกัด (มหาชน)',
  '0105563175048': 'บริษัท ไนซ์ชอยซ์ จำกัด',
  '0105552129309': 'บริษัท ไอ สไตล์ พริ้นติ้ง จำกัด',
  '0105549025026': 'บริษัท ทรู อินเทอร์เน็ต คอร์ปอเรชั่น จำกัด',
  '0105560133760': 'บริษัท ทรู ดิจิทัล พาร์ค จำกัด',
  '0105550095270': 'บริษัท นายทำถูก จำกัด',
  '0115559009368': 'บริษัท วันไลฟ์ กราฟฟิก จำกัด',
  '0105544080525': 'บริษัท แสงเจริญพริ้นต์ แอนด์ เพรส จำกัด',
  '0105562090693': 'บริษัท มอร์แดนบรีท จำกัด',
  '0105537143215': 'บริษัท ออฟฟิศเมท (ไทย) จำกัด',
  '0105559082715': 'บริษัท โพลาร์ แบร์ มิชชั่น จำกัด',
  '0105555033892': 'บริษัท บราเทอร์เจ จำกัด',
  '0107567000414': 'บริษัท ซีพี แอ็กซ์ตร้า จำกัด (มหาชน)',
}

function preferPlausibleInvoiceNo(a?: string, b?: string): string | undefined {
  const norm = (s?: string) => {
    if (!s) return undefined
    const recovered = recoverShopeeInvoiceNo(s)
    if (recovered) return recovered
    const cleaned = cleanInvoiceNo(s) || (invoiceNoLooksPlausible(s) ? compactInvoiceToken(s) : undefined)
    return cleaned && invoiceNoLooksPlausible(cleaned) ? cleaned : undefined
  }
  const aOk = norm(a)
  const bOk = norm(b)
  if (aOk && inferSellerFromInvoiceNo(aOk)) return aOk
  if (bOk && inferSellerFromInvoiceNo(bOk)) return bOk
  if (aOk && bOk && officeInvoiceRank(aOk) !== officeInvoiceRank(bOk)) {
    return officeInvoiceRank(aOk) > officeInvoiceRank(bOk) ? aOk : bOk
  }
  return aOk || bOk
}

/** IV690819-0637 과 690819-0637 은 같은 장. 끝 일련번호만 같으면 다른 문서 */
export function invoiceTokensAreSameDocument(a?: string, b?: string): boolean {
  return purchaseInvoiceNosAreSameDocument(a, b)
}

function vatPairLooksOk(row: ExtractedPurchaseTaxInvoiceFields | null | undefined): boolean {
  if (row?.netAmount == null || row.vatAmount == null) return false
  if (row.netAmount === 0 && row.vatAmount === 0) return true
  return row.vatAmount > 0 && !purchaseTaxVatLooksWrong(row.netAmount, row.vatAmount) && row.netAmount >= 20
}

export function mergeComplementaryInvoiceRows(
  a: ExtractedPurchaseTaxInvoiceFields,
  b: ExtractedPurchaseTaxInvoiceFields
): ExtractedPurchaseTaxInvoiceFields {
  const invoiceNo = preferPlausibleInvoiceNo(a.invoiceNo, b.invoiceNo)
  const aVat = vatPairLooksOk(a)
  const bVat = vatPairLooksOk(b)
  const useBAmt = bVat && !aVat
  const useAAmt = aVat && !bVat
  const nameA = trimPurchaseTaxSellerName(a.sellerName)
  const nameB = trimPurchaseTaxSellerName(b.sellerName)
  const tinA = digitsTin13(a.sellerTaxId)
  const tinB = digitsTin13(b.sellerTaxId)
  const tinAOk = tinA.length === 13 && thaiTinChecksumOk(tinA)
  const tinBOk = tinB.length === 13 && thaiTinChecksumOk(tinB)
  let sellerTaxId = tinAOk ? tinA : tinBOk ? tinB : undefined
  if (tinAOk && tinBOk && tinA !== tinB) {
    const bJunk = String(b.sellerName || '').replace(nameB, '').replace(/\D/g, '').length
    const aJunk = String(a.sellerName || '').replace(nameA, '').replace(/\D/g, '').length
    if (useBAmt && !aVat) sellerTaxId = tinA
    else if (useAAmt && !bVat) sellerTaxId = tinB
    else sellerTaxId = aJunk <= bJunk ? tinA : tinB
  }
  const fromInv = invoiceNo ? inferDocDateFromInvoiceNo(invoiceNo) : undefined
  const docDate = fromInv || a.docDate || b.docDate
  return {
    ...a,
    ...b,
    invoiceNo,
    docDate,
    sellerName: (nameA.length >= nameB.length ? nameA : nameB) || nameA || nameB || undefined,
    sellerTaxId,
    sellerBranch: a.sellerBranch || b.sellerBranch,
    netAmount: useBAmt ? b.netAmount : useAAmt ? a.netAmount : (a.netAmount ?? b.netAmount),
    vatAmount: useBAmt ? b.vatAmount : useAAmt ? a.vatAmount : (a.vatAmount ?? b.vatAmount),
    totalAmount: useBAmt ? b.totalAmount : useAAmt ? a.totalAmount : (a.totalAmount ?? b.totalAmount),
    isCopy: a.isCopy === true || b.isCopy === true,
  }
}

export function collapseExtractedInvoices(
  rows: ExtractedPurchaseTaxInvoiceFields[]
): ExtractedPurchaseTaxInvoiceFields[] {
  const out: ExtractedPurchaseTaxInvoiceFields[] = []
  for (const row of rows) {
    const i = out.findIndex((p) => invoiceTokensAreSameDocument(p.invoiceNo, row.invoiceNo))
    if (i >= 0) out[i] = mergeComplementaryInvoiceRows(out[i], row)
    else out.push(row)
  }
  return out
}

export function inferSellerFromInvoiceNo(
  invoiceNo: string,
  sellerTaxId?: string
): { tin: string; name: string } | null {
  const inv = platformInvoiceBlob(String(invoiceNo || '').trim())
  if (!inv) return null
  for (const row of KNOWN_INVOICE_SELLERS) {
    if (row.re.test(inv)) return { tin: row.tin, name: row.name }
  }
  if (!digitsTin13(sellerTaxId) && /^69\d{5}$/.test(inv)) {
    return { tin: '0105550102497', name: KNOWN_TIN_SELLER_NAMES['0105550102497'] }
  }
  return null
}

export function inferDocDateFromInvoiceNo(invoiceNo: string): string | undefined {
  const s = platformInvoiceBlob(fixOcrInvoiceLetterIPrefix(String(invoiceNo || '').trim()))
  const im = s.match(/^IM(20\d{2})(\d{2})(\d{2})\d+$/i)
  if (im) return ymdFromParts(Number(im[1]), Number(im[2]), Number(im[3]))
  const lm = s.match(/^LMRN(20\d{2})(\d{2})(\d{2})/i)
  if (lm) return ymdFromParts(Number(lm[1]), Number(lm[2]), Number(lm[3]))
  const shopee =
    s.match(/^TRS[A-Z]{2,10}00-\d{5}-(\d{2})(\d{2})(\d{2})-\d+$/i) ||
    s.match(/^(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])-(\d{5,8})$/)
  if (shopee) return ymdFromParts(2000 + Number(shopee[1]), Number(shopee[2]), Number(shopee[3]))
  const kb = s.match(/^(\d{2})(\d{2})(\d{2})[EFH]\d+$/i)
  if (kb) return ymdFromParts(2000 + Number(kb[3]), Number(kb[2]), Number(kb[1]))
  const kbW = s.match(/^370(\d{2})(\d{2})(\d{2})W\d+$/i)
  if (kbW) return ymdFromParts(2000 + Number(kbW[3]), Number(kbW[2]), Number(kbW[1]))
  const officePrefixed = s.match(
    /^(?:INV|IVT|IV|INCT)[\-/]?(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[\-/]?\d+)?$/i
  )
  if (officePrefixed) return ymdFromParts(Number(officePrefixed[1]), Number(officePrefixed[2]), Number(officePrefixed[3]))
  const ivYmd = s.match(/^IV(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])-\d+$/i)
  if (ivYmd) return ymdFromParts(Number(ivYmd[1]), Number(ivYmd[2]), Number(ivYmd[3]))
  const inctYmd = s.match(/^INCT(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d+$/i)
  if (inctYmd) return ymdFromParts(Number(inctYmd[1]), Number(inctYmd[2]), Number(inctYmd[3]))
  const officeBare = s.match(/^(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[\-/]\d{2,}$/)
  if (officeBare) return ymdFromParts(Number(officeBare[1]), Number(officeBare[2]), Number(officeBare[3]))
  return undefined
}

function extractSellerBranchRaw(text: string): string | undefined {
  const s = String(text || '')
  if (/สำนักงานใหญ่|head\s*office|\bhq\b/i.test(s) && !/สาขา\s*\d/.test(s)) return 'สำนักงานใหญ่'
  const branch = s.match(/สาขา\s*[:.\-]?\s*(\d{1,5})/i)
  if (branch) return branch[1]
  return undefined
}

const COMPANY_NAME_RE =
  /((?:บริษัท|ห้างหุ้นส่วน(?:จำกัด)?|ร้าน|ทรัสต์)\s+[^\n]{2,90}(?:จำกัด(?:\s*\(มหาชน\))?)?)/g

const BUYER_NAME_ZONE_RE =
  /ที่อยู่ในการจัดส่ง|จัดส่งเอกสาร|ที่อยู่ตามภาษีมูลค่าเพิ่ม|ชื่อลูกค้า|รหัสลูกค้า|ผู้ซื้อ|ลูกค้า|ผู้รับใบกำกับ|BILL\s*TO|SHIP\s*TO/i

function companyNameCore(name: string): string {
  return trimPurchaseTaxSellerName(name)
    .replace(/บริษัท|ห้างหุ้นส่วน(?:จำกัด)?|จำกัด(?:\s*\(มหาชน\))?|สำนักงานใหญ่/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sellerNamesShareCompany(a: string, b: string): boolean {
  const ca = companyNameCore(a)
  const cb = companyNameCore(b)
  if (!ca || !cb) return false
  if (ca === cb || ca.includes(cb) || cb.includes(ca)) return true
  const wa = new Set(ca.split(/\s+/).filter((w) => w.length >= 2))
  const wb = cb.split(/\s+/).filter((w) => w.length >= 2)
  const hit = wb.filter((w) => wa.has(w)).length
  return hit >= 2 || (hit >= 1 && Math.min(wa.size, wb.length) <= 2)
}

function nameLooksLikeBuyerHint(name: string, buyerName?: string): boolean {
  const n = trimPurchaseTaxSellerName(name)
  const buyer = String(buyerName || '').trim()
  if (!n || !buyer) return false
  return n.includes(buyer) || buyer.includes(n) || sellerNamesShareCompany(n, buyer)
}

/** 세금번호 바로 앞 상호. 배송지·구매자 블록의 첫 บริษัท 보다 판매자에 가깝다. */
function companyNameNearTin(text: string, tin: string): string | undefined {
  const tinDigits = digitsTin13(tin)
  if (tinDigits.length !== 13) return undefined
  const tinRe = new RegExp(tinDigits.split('').join('[\\s-]*'))
  const s = String(text || '')
  const m = s.match(tinRe)
  if (!m || m.index == null) return undefined
  const before = s.slice(Math.max(0, m.index - 280), m.index)
  const matches = [...before.matchAll(new RegExp(COMPANY_NAME_RE.source, 'g'))]
  const last = matches[matches.length - 1]
  if (!last) return undefined
  const name = trimPurchaseTaxSellerName(last[1])
  if (!name || looksLikeJunkSellerName(name)) return undefined
  return name.slice(0, 200)
}

function companyIsInBuyerNameZone(text: string, index: number, name: string): boolean {
  const lineStart = text.lastIndexOf('\n', index) + 1
  const prevBreak = text.lastIndexOf('\n', Math.max(0, lineStart - 2))
  const prevLine = text.slice(prevBreak + 1, lineStart)
  const lineEnd = text.indexOf('\n', index)
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
  if (BUYER_NAME_ZONE_RE.test(line) || BUYER_NAME_ZONE_RE.test(prevLine)) return true
  const after = text.slice(index, Math.min(text.length, index + name.length + 40))
  return BUYER_NAME_ZONE_RE.test(after) && !/(?:ผู้ขาย|ผู้จำหน่าย|ผู้ประกอบการ)/i.test(after)
}

function extractSellerName(text: string, buyerName?: string, sellerTaxId?: string): string | undefined {
  const s = String(text || '')
  const labeled = s.match(
    /(?:ผู้ขาย|ผู้จำหน่าย|ผู้ประกอบการ|Seller|Vendor)\s*[:\-]?\s*([^\n]{3,120})/i
  )
  if (labeled) {
    const name = trimPurchaseTaxSellerName(labeled[1])
    if (
      name &&
      !/ผู้ซื้อ|ลูกค้า|Buyer/i.test(name) &&
      !looksLikeJunkSellerName(name) &&
      !nameLooksLikeBuyerHint(name, buyerName)
    ) {
      return name
    }
  }
  const nearTin = sellerTaxId ? companyNameNearTin(s, sellerTaxId) : undefined
  if (nearTin && !nameLooksLikeBuyerHint(nearTin, buyerName)) return nearTin

  COMPANY_NAME_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = COMPANY_NAME_RE.exec(s))) {
    if (m.index == null) continue
    const name = trimPurchaseTaxSellerName(m[1])
    if (!name || looksLikeJunkSellerName(name) || nameLooksLikeBuyerHint(name, buyerName)) continue
    if (companyIsInBuyerNameZone(s, m.index, name)) continue
    return name.slice(0, 200)
  }
  return undefined
}

function lineLooksLikeWithholdingOrExempt(line: string): boolean {
  return /หัก.{0,12}ที่จ่าย|ถูกหัก|withholding|\bwht\b|สินค้าเกษตรยกเว้น|ยกเว้นภาษี|vat\s*exempt|VAT\s*EXEMPTED/i.test(
    line
  )
}

function looksLikeWithholdingAmount(net: number, n: number): boolean {
  if (!(net > 0) || !(n > 0) || n >= net) return false
  return [0.01, 0.02, 0.03, 0.05].some((r) => Math.abs(roundMoney2(net * r) - n) <= 0.05)
}

/**
 * 한 장 전체가 영세(0/0). 농산물 면세 한 줄만 있는 과세 계산서와 구분한다.
 * 판매자·번호 패턴에 의존하지 않음.
 */
export function pageLooksFullyVatExempt(text: string): boolean {
  const s = String(text || '')
  if (!s.trim()) return false
  const vatLabeled = extractAmountNear(s, /ภาษีมูลค่าเพิ่ม|VAT\s*7|Vat amount|ภาษี\s*7/i)
  if (vatLabeled != null && vatLabeled > 0.05) return false
  if (pickExclusiveVatAmounts(collectBahtAmounts(s))) return false
  if (vatLabeled === 0) return true
  if (
    /ยกเว้น(?:ภาษี|VAT|vat).{0,24}ทั้งใบ|ทั้งใบ.{0,24}ยกเว้น|สินค้ายกเว้น\s*(?:VAT|ภาษี)|VAT\s*EXEMPTED\s*(?:ITEMS?)?\b/i.test(
      s
    )
  ) {
    return true
  }
  const netLabeled = extractAmountNear(s, /มูลค่าสินค้า|มูลค่า(?!เพิ่ม)|ฐานภาษี|Taxable|Net\s*amount/i)
  return netLabeled === 0 && (vatLabeled == null || vatLabeled === 0)
}

function pageHasTaxableVatPair(text: string): boolean {
  if (pickExclusiveVatAmounts(collectBahtAmounts(text))) return true
  const vatLabeled = extractAmountNear(text, /ภาษีมูลค่าเพิ่ม|VAT\s*7|Vat amount|ภาษี\s*7/i)
  return vatLabeled != null && vatLabeled > 0.05
}

function extractAmountNear(text: string, keywords: RegExp): number | undefined {
  const isVat = /ภาษีมูลค่าเพิ่ม|VAT\s*7|Vat amount|ภาษี\s*7/i.test(keywords.source)
  const tableHeader = /รายการ|รหัสสินค้า|หน่วยนับ|ราคา\/?หน่วย|ราคาหน่วย/i
  const qtyLine = /กก\.?|กิโล|ถัง|ขนาดบรรจุ/i
  const lines = String(text || '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (lineLooksLikeWithholdingOrExempt(line)) continue
    const idx = line.search(keywords)
    if (idx < 0) continue
    if (isVat && /ก่อนภาษีมูลค่าเพิ่ม|จำนวนเงินรวมก่อน/i.test(line)) continue
    if (tableHeader.test(line) && moneyFromFragment(line) == null) continue
    let frag = line.slice(idx)
    if (isVat) frag = frag.split(/รวมทั้งสิ้น|ยอดรวมสุทธิ|Grand\s*total|Amount\s*due/i)[0]
    const v = moneyFromFragment(frag)
    if (v != null) return v
    for (const extra of [lines[i + 1], lines[i + 2]]) {
      if (!extra || lineLooksLikeWithholdingOrExempt(extra) || tableHeader.test(extra) || qtyLine.test(extra)) continue
      const n = moneyFromFragment(extra)
      if (n != null) return n
    }
  }
  const usable = lines
    .filter((line) => !lineLooksLikeWithholdingOrExempt(line) && !tableHeader.test(line) && !(isVat && /ก่อนภาษีมูลค่าเพิ่ม/.test(line)))
    .join(' ')
  const m = usable.match(keywords)
  if (!m || m.index == null) return undefined
  let frag = usable.slice(m.index, m.index + 96)
  if (isVat) frag = frag.split(/รวมทั้งสิ้น|ยอดรวมสุทธิ|Grand\s*total|Amount\s*due/i)[0]
  return moneyFromFragment(frag)
}

function collectBahtAmounts(text: string): number[] {
  const out: number[] = []
  for (const line of String(text || '').split(/\r?\n/)) {
    if (lineLooksLikeWithholdingOrExempt(line)) continue
    for (const m of line.matchAll(/\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/g)) {
      const v = Number(m[0].replace(/,/g, ''))
      if (Number.isFinite(v) && v > 0 && v < 500_000_000) out.push(roundMoney2(v))
    }
  }
  return out
}

/** `48.36` 이 `1,148.36` 의 앞자리만 떨어진 OCR 조각인지 */
function amountLooksLikeOcrFragment(n: number, pool: number[]): boolean {
  const token = n.toFixed(2)
  return pool.some((b) => b > n + 0.05 && b >= n * 8 && b.toFixed(2).endsWith(token))
}

/**
 * 페이지에 찍힌 숫자만으로 공급가·부가세를 고른다.
 * 공급가+합계의 차가 7%이면 그걸 쓰고, 큰 숫자의 7%가 작은 숫자의 공급가인
 * “바깥 쌍”(합계를 공급가로 오인)은 버린다.
 */
export function pickExclusiveVatAmounts(nums: number[]): {
  netAmount: number
  vatAmount: number
  totalAmount: number
} | null {
  const pool = [...new Set(nums.map((n) => roundMoney2(n)).filter((n) => n > 0))]
  type Cand = { netAmount: number; vatAmount: number; totalAmount: number; score: number; lastIdx: number }
  const cands: Cand[] = []
  for (const net of pool) {
    if (amountLooksLikeOcrFragment(net, pool)) continue
    for (const total of pool) {
      if (total <= net) continue
      const vatAmount = roundMoney2(total - net)
      if (vatAmount < 0.01 || purchaseTaxVatLooksWrong(net, vatAmount)) continue
      cands.push({
        netAmount: net,
        vatAmount,
        totalAmount: total,
        score: (pool.includes(vatAmount) ? 6 : 4) + (pool.includes(vatAmount) && pool.includes(total) ? 3 : 0),
        lastIdx: Math.max(nums.lastIndexOf(net), nums.lastIndexOf(total)),
      })
    }
    for (const vatAmount of pool) {
      if (vatAmount >= net || purchaseTaxVatLooksWrong(net, vatAmount)) continue
      const totalAmount = roundMoney2(net + vatAmount)
      cands.push({
        netAmount: net,
        vatAmount,
        totalAmount,
        score: (pool.includes(totalAmount) ? 6 : 3) + (pool.includes(totalAmount) ? 3 : 0),
        lastIdx: Math.max(nums.lastIndexOf(net), nums.lastIndexOf(vatAmount)),
      })
    }
  }
  if (!cands.length) return null
  for (const c of cands) {
    if (cands.some((o) => o !== c && Math.abs(o.netAmount - c.vatAmount) < 0.02 && o.netAmount < c.netAmount - 0.05)) {
      c.score -= 12
    }
    if (looksLikeWithholdingAmount(c.netAmount, c.vatAmount)) c.score -= 8
    const bigger = cands.find(
      (o) => o.netAmount >= Math.max(200, c.netAmount * 4) && o.score >= c.score - 3
    )
    if (c.netAmount < 80 && bigger) c.score -= 10
    const largerComplete = cands.find(
      (o) => o !== c && o.netAmount > c.netAmount + 0.05 && o.score >= c.score - 2
    )
    if (largerComplete) c.score -= 5
  }
  cands.sort((a, b) => b.score - a.score || b.netAmount - a.netAmount || b.lastIdx - a.lastIdx)
  const top = cands[0]
  if (top.score < 0) return null
  return { netAmount: top.netAmount, vatAmount: top.vatAmount, totalAmount: top.totalAmount }
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
  if (pageLooksFullyVatExempt(text)) {
    const totalAmount = extractAmountNear(text, /รวมทั้งสิ้น|ยอดรวมสุทธิ|Grand\s*total|Amount\s*due/i)
    return { netAmount: 0, vatAmount: 0, totalAmount: totalAmount ?? 0 }
  }
  const fromExempt = inferTaxableExcludingExempt(text)
  if (fromExempt) return fromExempt
  const fromFees = inferTaxableFromShippingAndService(text)
  if (fromFees) return fromFees
  const nums = collectBahtAmounts(text)
  const picked = pickExclusiveVatAmounts(nums)
  if (picked) return picked
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
  for (let i = 0; i < nums.length; i += 1) {
    const vatAmount = nums[i]
    if (vatAmount < 0.5 || vatAmount > 100_000) continue
    const wantNet = roundMoney2(vatAmount / 0.07)
    const netAmount = nums.find((n, j) => j !== i && Math.abs(n - wantNet) <= 0.05)
    if (netAmount != null && netAmount > vatAmount) {
      return { netAmount, vatAmount, totalAmount: roundMoney2(netAmount + vatAmount) }
    }
  }
  return null
}

/** 면세 농산물 + 7% 과세(배송·수수료)가 한 장에 있을 때 면세 합계를 공급가로 쓰지 않는다 */
function inferTaxableExcludingExempt(text: string): {
  netAmount: number
  vatAmount: number
  totalAmount: number
} | null {
  const exemptParts = collectLabeledBahtParts(
    text,
    /สินค้าเกษตรยกเว้น|VAT\s*EXEMPTED|exempted\s*items/i
  )
  if (!exemptParts.length) return null
  const grand = extractAmountNear(text, /รวมทั้งสิ้น|ยอดรวมสุทธิ|Grand\s*total|Amount\s*due|SUBTOTAL/i)
  const vat = extractAmountNear(text, /ภาษีมูลค่าเพิ่ม|VAT\s*7|Vat amount|ภาษี\s*7/i)
  if (vat == null || vat <= 0 || grand == null || grand <= 0) return null
  const exempt = Math.max(...exemptParts)
  if (grand <= exempt) return null
  const rest = roundMoney2(grand - exempt)
  const wantNet = roundMoney2(vat / 0.07)
  if (Math.abs(rest - roundMoney2(wantNet + vat)) <= 0.2) {
    const nums = collectBahtAmounts(text)
    const netHit = nums.find((n) => Math.abs(n - wantNet) <= 0.05)
    return {
      netAmount: netHit ?? wantNet,
      vatAmount: vat,
      totalAmount: rest,
    }
  }
  const nums = collectBahtAmounts(text)
  const netHit = nums.find((n) => Math.abs(n - wantNet) <= 0.05)
  if (netHit != null && netHit > vat) {
    return { netAmount: netHit, vatAmount: vat, totalAmount: roundMoney2(netHit + vat) }
  }
  return null
}

/** Grab·Shopee: 배송비+수수료 합 = 과세 공급가 (한 칸에 합계가 안 찍힌 경우) */
function inferTaxableFromShippingAndService(text: string): {
  netAmount: number
  vatAmount: number
  totalAmount: number
} | null {
  const shippingParts = collectLabeledBahtParts(text, /ค่าจัดส่ง|ค่าขนส่ง|SHIPPING|DELIVERY\s*FEE/i)
  const serviceParts = collectLabeledBahtParts(text, /ค่าบริการ|SERVICE\s*FEE|HANDLING/i)
  const vatLabeled = extractAmountNear(text, /ภาษีมูลค่าเพิ่ม|VAT\s*7|Vat amount|ภาษี\s*7/i)
  if (vatLabeled == null || vatLabeled <= 0) return null
  const wantNet = roundMoney2(vatLabeled / 0.07)
  for (const s of shippingParts) {
    for (const f of serviceParts) {
      const net = roundMoney2(s + f)
      if (Math.abs(net - wantNet) <= 0.05) {
        return { netAmount: net, vatAmount: vatLabeled, totalAmount: roundMoney2(net + vatLabeled) }
      }
    }
  }
  return null
}

function collectLabeledBahtParts(text: string, label: RegExp): number[] {
  const out: number[] = []
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!label.test(line) || lineLooksLikeWithholdingOrExempt(line)) continue
    for (const m of line.matchAll(/\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/g)) {
      const v = Number(m[0].replace(/,/g, ''))
      if (Number.isFinite(v) && v > 0) out.push(roundMoney2(v))
    }
  }
  return out
}

function firstQueryValue(params: URLSearchParams, keys: string[]): string {
  const lower = new Map<string, string>()
  params.forEach((v, k) => {
    if (v && !lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), v)
  })
  for (const k of keys) {
    const v = lower.get(k.toLowerCase()) || params.get(k)
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
      `เลขที่ ${firstQueryValue(q, ['invoiceNo', 'invoice_no', 'inv', 'docno', 'number', 'no', 'invoicenumber', 'invoice'])}`,
      `เลขประจำตัวผู้เสียภาษี ${firstQueryValue(q, ['sellerTaxId', 'seller_tax_id', 'tin', 'taxId', 'nid', 'seller', 'taxid', 'sellertin'])}`,
      `วันที่ ${firstQueryValue(q, ['date', 'docDate', 'issueDate', 'issuedate', 'docdate'])}`,
      `มูลค่า ${firstQueryValue(q, ['net', 'base', 'amount', 'value', 'baseamount', 'netAmount', 'netamount'])}`,
      `ภาษีมูลค่าเพิ่ม ${firstQueryValue(q, ['vat', 'vatAmount', 'tax', 'vatamount'])}`,
      `รวมทั้งสิ้น ${firstQueryValue(q, ['total', 'grand', 'sum', 'grandtotal', 'grandTotal'])}`,
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
    const invoice = parts.find((p) => {
      if (digitsTin13(p).length === 13) return false
      if (/^\d{1,3}(?:,\d{3})+\.\d{2}$|^\d+\.\d{2}$/.test(p)) return false
      return /^[A-Z0-9][A-Z0-9\-/]{2,40}$/i.test(p)
    })
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

/** pdf.js 글자 조각을 같은 줄끼리 붙여 มูลค่า/VAT가 라벨과 떨어지지 않게 함 */
export function joinPdfTextItemsByLine(
  items: Array<{ str?: string; transform?: number[] }>
): string {
  const rows = items
    .map((item) => ({
      str: String(item.str || '').trim(),
      x: Number(item.transform?.[4]) || 0,
      y: Number(item.transform?.[5]) || 0,
    }))
    .filter((r) => r.str)
  if (!rows.length) return ''
  rows.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x))
  const lines: string[][] = []
  let currentY = rows[0]?.y ?? 0
  let current: string[] = []
  for (const r of rows) {
    if (current.length && Math.abs(r.y - currentY) > 4) {
      lines.push(current)
      current = [r.str]
      currentY = r.y
    } else {
      current.push(r.str)
    }
  }
  if (current.length) lines.push(current)
  return lines.map((parts) => parts.join(' ')).join('\n')
}

/** 복합기 OCR/Tesseract 잡음: 세금번호 사이 공백, 전각 숫자, 숫자 속 O/l */
export function normalizeTaxInvoiceOcrText(text: string): string {
  let s = String(text || '').replace(/\u00a0/g, ' ')
  s = s.replace(/[๐-๙]/g, (ch) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(ch)))
  s = s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48))
  s = s.replace(/(\d{1,3})\.(\d{3}),(\d{2})\b/g, '$1$2.$3')
  s = s.replace(/(\d)[Oo](\d)/g, '$10$2')
  s = s.replace(/(\d)[Il|](\d)/g, '$11$2')
  s = s.replace(/\b[Oo](\d{12})\b/g, '0$1')
  s = s.replace(/\b[Il|](\d{12})\b/g, '1$1')
  s = s.replace(/(\d{12})[Oo]\b/g, '$10')
  s = s.replace(/(\d{12})[Il|]\b/g, '$11')
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

/** 스캔 PDF의 깨진 OCR 글자층은 키워드만 있고 필드는 비어 있음 → Tesseract를 건너뛰면 안 됨 */
export function pdfPageTextIsReliableForExtract(
  text: string,
  hint?: PurchaseTaxInvoiceScanHint
): boolean {
  if (!pdfPageTextLooksPrinted(text)) return false
  return purchaseTaxInvoiceTextExtractIsComplete(
    extractPurchaseTaxInvoiceFromScanText(text, hint),
    hint
  )
}

const PTI_SCAN_I18N_KEYS = new Set([
  'ptiOcrFailed',
  'ptiOcrPageTimeout',
  'ptiOcrLoading',
  'ptiPdfEmptyPage',
  'ptiPdfSkipCopy',
  'ptiDupError',
  'ptiScanErrRateLimit',
  'ptiScanErrAuth',
  'ptiScanErrModel',
  'ptiScanErrNoImage',
  'ptiScanErrNoKey',
  'ptiSubmittedLocked',
  'msg_load_fail',
  'msg_save_fail',
  'msg_delete_fail',
])

/** 검수·오류 문구용 i18n 키 — 로컬 스캔(글자층·QR·OCR) 실패. 이미 키면 그대로. */
export function purchaseTaxInvoiceScanFailI18nKey(
  error?: string,
  fallback: 'ptiPdfEmptyPage' | 'ptiOcrFailed' = 'ptiPdfEmptyPage'
): string {
  const e = String(error || '').trim()
  if (PTI_SCAN_I18N_KEYS.has(e) || /^pti[A-Z]/.test(e)) return e
  if (
    e === 'ocr_failed' ||
    e === 'ocr_browser_only' ||
    e === 'tesseract_createWorker_missing' ||
    /tesseract|pdf\.js|canvas 2d|file read failed|image load failed|CDN load|browser only/i.test(e)
  ) {
    return 'ptiOcrFailed'
  }
  return fallback
}

function scanSection(raw: string, name: string): string {
  const re = new RegExp(`===${name}===\\s*([\\s\\S]*?)(?====|$)`)
  return raw.match(re)?.[1]?.trim() || ''
}

/** 글자층이 완전해도 QR은 따로 붙여 교차검증. 한 장 2매면 QR을 여러 개 붙임. */
export function wrapTaxInvoiceQrText(qr: string | string[]): string {
  const parts = (Array.isArray(qr) ? qr : [qr]).map((p) => String(p || '').trim()).filter(Boolean)
  return parts.map((p) => `===QR===\n${p}`).join('\n')
}

function qrLooksLikeLineOrSocial(raw: string): boolean {
  return /^https?:\/\/(?:[\w.-]+\.)?(?:line\.me|lin\.ee|liff\.line\.me|facebook\.com)\b/i.test(String(raw || '').trim())
}

function invoiceNoFromQrPayload(raw: string): string | undefined {
  return extractInvoiceNo(raw)?.toUpperCase() || parsePurchaseTaxInvoiceQrPayload(raw)?.invoiceNo?.toUpperCase()
}

function uniqueInvoiceDocuments(numbers: string[]): string[] {
  const out: string[] = []
  for (const n of numbers) {
    if (!out.some((p) => invoiceTokensAreSameDocument(p, n))) out.push(n)
  }
  return out
}

export function splitScanTextIntoInvoiceBlocks(text: string): string[] {
  const raw = String(text || '')
  if (!raw.trim()) return []
  const qrs = [...raw.matchAll(/===QR===\s*([\s\S]*?)(?====|$)/g)]
    .map((m) => String(m[1] || '').trim())
    .filter((s) => s.length >= 8)
  const uniqueQrs = [...new Set(qrs)]
  const candidateQrs = uniqueQrs.filter((q) => !qrLooksLikeLineOrSocial(q))
  if (candidateQrs.length >= 2) {
    const qrInvoiceNos = candidateQrs.map((q) => invoiceNoFromQrPayload(q)).filter((n): n is string => !!n)
    const uniqueInv = uniqueInvoiceDocuments(qrInvoiceNos)
    if (uniqueInv.length < 2) return [raw]
    const rest = raw.replace(/===QR===\s*[\s\S]*?(?====|$)/g, '').trim()
    const lines = rest.split(/\n/)
    const mid = Math.max(1, Math.floor(lines.length / 2))
    return candidateQrs.slice(0, 2).map((q, i) => {
      const half = i === 0 ? lines.slice(0, mid).join('\n') : lines.slice(mid).join('\n')
      return `===QR===\n${q}\n${half}`
    })
  }
  const markers: number[] = []
  const re = /ใบกำกับภาษี|ต้นฉบับ/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    if (!markers.length || m.index - markers[markers.length - 1] > 120) markers.push(m.index)
  }
  const platformNos = [
    ...new Set(
      [...platformInvoiceBlob(raw).matchAll(new RegExp(PLATFORM_INVOICE_RE.source, 'gi'))]
        .map((hit) => cleanInvoiceNo(platformInvoiceBlob(hit[1]))?.toUpperCase())
        .filter((n): n is string => !!n)
    ),
  ]
  const invoiceNos = [...raw.matchAll(/เลขที่\s*([A-Za-z0-9][A-Za-z0-9\-/ ]{2,80})/g)]
    .map((hit) => cleanInvoiceNo(hit[1])?.toUpperCase())
    .filter((n): n is string => !!n)
  const uniqueInvoiceNos = uniqueInvoiceDocuments(invoiceNos)
  if (markers.length >= 2 && (uniqueInvoiceDocuments(platformNos).length >= 2 || uniqueInvoiceNos.length >= 2)) {
    return markers.slice(0, 2).map((start, i, arr) => raw.slice(start, i + 1 < arr.length ? arr[i + 1] : raw.length))
  }
  return [raw]
}

export function extractPurchaseTaxInvoicesFromScanText(
  text: string,
  hint?: PurchaseTaxInvoiceScanHint
): ExtractedPurchaseTaxInvoiceFields[] {
  const blocks = splitScanTextIntoInvoiceBlocks(text)
  const rows: ExtractedPurchaseTaxInvoiceFields[] = []
  for (const block of blocks.length ? blocks : [text]) {
    const row = extractPurchaseTaxInvoiceFromScanText(block, hint)
    if (!row || !purchaseTaxInvoiceHasExtractedFields(row)) continue
    rows.push(row)
  }
  return collapseExtractedInvoices(rows).map((row) =>
    repairExtractedPurchaseTaxInvoice(row, { ...hint, pageText: hint?.pageText || text })
  )
}

export function fillSellerNameFromTinLookup(
  row: ExtractedPurchaseTaxInvoiceFields,
  known: Array<{ sellerTaxId?: string; sellerName?: string }>
): ExtractedPurchaseTaxInvoiceFields {
  const tin = digitsTin13(row.sellerTaxId)
  if (tin.length !== 13) return row
  const current = String(row.sellerName || '').trim()
  if (current && !looksLikeJunkSellerName(current)) return row
  const hit = known.find((k) => digitsTin13(k.sellerTaxId) === tin && String(k.sellerName || '').trim())
  if (!hit?.sellerName) return row
  return { ...row, sellerName: String(hit.sellerName).trim().slice(0, 200) }
}

export function extractPurchaseTaxInvoiceFromScanText(
  text: string,
  hint?: PurchaseTaxInvoiceScanHint
): ExtractedPurchaseTaxInvoiceFields | null {
  const raw = String(text || '')
  const qrMatch = raw.match(/===QR===\s*([\s\S]*?)(?:===|$)/)
  const headerText = [scanSection(raw, 'HEADER'), scanSection(raw, 'HEADER_PSM4'), scanSection(raw, 'HEADER_DIGITS')].filter(Boolean).join('\n')
  const digitsBlock = scanSection(raw, 'TOTALS_DIGITS')
  const totalsBlock = [scanSection(raw, 'TOTALS'), scanSection(raw, 'TOTALS_PSM4')].filter(Boolean).join('\n')
  const urlMatch = raw.match(/https?:\/\/[^\s<>"']+/i)
  const fromQr =
    (qrMatch ? parsePurchaseTaxInvoiceQrPayload(qrMatch[1]) : null) ||
    (urlMatch ? parsePurchaseTaxInvoiceQrPayload(urlMatch[0]) : null)
  const fromHeader = headerText ? parsePurchaseTaxInvoiceFromPdfText(headerText, hint) : null
  const fromText = parsePurchaseTaxInvoiceFromPdfText(raw, hint)
  const inferred =
    inferAmountsFromMoneySequence(digitsBlock) ||
    inferAmountsFromMoneySequence(totalsBlock) ||
    inferAmountsFromMoneySequence(raw)
  let merged = mergePurchaseTaxInvoiceExtract(fromQr, fromHeader)
  merged = mergePurchaseTaxInvoiceExtract(merged, fromText)
  if (inferred) {
    const keepZero =
      merged?.netAmount === 0 && (merged.vatAmount === 0 || merged.vatAmount == null)
    const amountsWeak =
      !keepZero &&
      !pageLooksFullyVatExempt(raw) &&
      (!merged ||
        merged.netAmount == null ||
        merged.vatAmount == null ||
        (merged.vatAmount > 0 && purchaseTaxVatLooksWrong(merged.netAmount, merged.vatAmount)))
    if (amountsWeak) {
      merged = mergePurchaseTaxInvoiceExtract(
        { netAmount: inferred.netAmount, vatAmount: inferred.vatAmount, totalAmount: inferred.totalAmount },
        merged
      )
    }
  }
  return merged ? repairExtractedPurchaseTaxInvoice(merged, { ...hint, pageText: hint?.pageText || raw }) : null
}

export function parsePurchaseTaxInvoiceFromPdfText(
  text: string,
  hint?: PurchaseTaxInvoiceScanHint
): ExtractedPurchaseTaxInvoiceFields | null {
  const raw = normalizeTaxInvoiceOcrText(text)
  if (raw.length < 12) return null
  const buyerTin = digitsTin13(hint?.buyerTaxId)
  const tins = extractTins(raw)
  const sellerTaxId = tins.find((tin) => tin !== buyerTin) || (tins[0] && tins[0] !== buyerTin ? tins[0] : undefined)
  const netAmountLabeled =
    extractAmountNear(raw, /มูลค่าสินค้า|มูลค่าที่คำนวณภาษี|มูลค่าก่อนภาษี|จำนวนเงินรวมก่อนภาษีมูลค่าเพิ่ม|รวมเป็นเงิน|รวมเงิน|มูลค่า(?!เพิ่ม)|ฐานภาษี|Taxable|Sub\s*total|Net\s*amount/i) ??
    extractAmountNear(raw, /ก่อนภาษี|ก่อน VAT/i)
  const vatAmountLabeled = extractAmountNear(raw, /จำนวนภาษีมูลค่าเพิ่ม|ภาษีมูลค่าเพิ่ม|VAT\s*7|Vat amount|ภาษี\s*7/i)
  const totalAmountLabeled = extractAmountNear(raw, /จำนวนเงินรวมภาษีมูลค่าเพิ่ม|รวมทั้งสิ้น|ยอดรวมสุทธิ|Grand\s*total|Amount\s*due/i)
  const inferred = inferAmountsFromMoneySequence(raw)
  const inferredOk =
    inferred != null && inferred.vatAmount > 0 && !purchaseTaxVatLooksWrong(inferred.netAmount, inferred.vatAmount)
  const labeledLineItem =
    inferredOk &&
    netAmountLabeled != null &&
    inferred.netAmount > netAmountLabeled + 0.05 &&
    (vatAmountLabeled == null ||
      purchaseTaxVatLooksWrong(netAmountLabeled, vatAmountLabeled) ||
      Math.abs(inferred.netAmount - netAmountLabeled) > 0.05)
  const netAmount = labeledLineItem ? inferred.netAmount : netAmountLabeled ?? inferred?.netAmount
  const vatAmount = labeledLineItem ? inferred.vatAmount : vatAmountLabeled ?? inferred?.vatAmount
  const totalAmount = labeledLineItem ? inferred.totalAmount : totalAmountLabeled ?? inferred?.totalAmount
  const row: ExtractedPurchaseTaxInvoiceFields = {
    docDate: parseTaxInvoiceDateFromText(raw),
    invoiceNo: extractInvoiceNo(raw, sellerTaxId, hint?.taxMonth, hint?.buyerTaxId),
    sellerName: extractSellerName(raw, hint?.buyerName, sellerTaxId),
    sellerTaxId: sellerTaxId && sellerTaxId.length === 13 && thaiTinChecksumOk(sellerTaxId) ? sellerTaxId : undefined,
    sellerBranch: formatSellerBranch(extractSellerBranchRaw(raw)),
    netAmount,
    vatAmount,
    totalAmount,
    isCopy: isLikelyTaxInvoiceCopy(raw),
  }
  return purchaseTaxInvoiceHasExtractedFields(row) ? row : null
}

/** e-Tax/인쇄 PDF처럼 글자층만으로 핵심 필드가 채워지면 브라우저 OCR을 생략해도 됨. */
export function purchaseTaxInvoiceTextExtractIsComplete(
  row: ExtractedPurchaseTaxInvoiceFields | null | undefined,
  hint?: PurchaseTaxInvoiceScanHint
): boolean {
  if (!row?.invoiceNo || !invoiceNoLooksPlausible(row.invoiceNo) || !row.sellerTaxId) return false
  if (row.sellerTaxId.length !== 13) return false
  const buyerTin = digitsTin13(hint?.buyerTaxId)
  if (buyerTin && row.sellerTaxId === buyerTin) return false
  if (row.netAmount == null || row.vatAmount == null) return false
  if (row.netAmount === 0 && row.vatAmount === 0) return true
  if (row.vatAmount > 0 && purchaseTaxVatLooksWrong(row.netAmount, row.vatAmount)) return false
  return true
}

function invoiceConflictsWithVendorHint(
  row: ExtractedPurchaseTaxInvoiceFields | null | undefined,
  hint?: PurchaseTaxInvoiceScanHint
): boolean {
  const tin = digitsTin13(row?.sellerTaxId)
  const vh = tin ? hint?.vendorHints?.get(tin) : undefined
  if (!vh || !row?.invoiceNo) return false
  return !invoiceMatchesVendorHint(row.invoiceNo, vh)
}

/** 1차 판독 뒤 고배율이 필요한 영역. 비면 고배율을 건너뛴다. */
export function purchaseTaxInvoiceHiresRegionNames(
  row: ExtractedPurchaseTaxInvoiceFields | null | undefined,
  hint?: PurchaseTaxInvoiceScanHint,
  layout?: LayoutExtract
): Array<'head-left' | 'head-right' | 'tail'> {
  const weak = purchaseTaxLayoutWeakRegions(layout)
  const complete = purchaseTaxInvoiceTextExtractIsComplete(row, hint)
  const mismatch = invoiceConflictsWithVendorHint(row, hint)
  if (complete && !weak.length && !mismatch) return []
  const needHead =
    mismatch ||
    !row?.invoiceNo ||
    !invoiceNoLooksPlausible(row.invoiceNo) ||
    !row.sellerTaxId ||
    row.sellerTaxId.length !== 13
  const needTail = row?.netAmount == null || row?.vatAmount == null
  const names = new Set<'head-left' | 'head-right' | 'tail'>(weak)
  if (needHead) {
    names.add('head-left')
    names.add('head-right')
  }
  if (needTail) names.add('tail')
  if (!names.size) names.add('head-left').add('head-right').add('tail')
  const order: Array<'head-left' | 'head-right' | 'tail'> = ['head-left', 'head-right', 'tail']
  return order.filter((n) => names.has(n))
}

/** 번호·TIN만 있고 금액이 비면 합계 크롭을 한 번 더 돌린다. 흐릿한 값도 다시 본다. */
export function purchaseTaxInvoiceNeedsSparseOcr(
  row: ExtractedPurchaseTaxInvoiceFields | null | undefined,
  hint?: PurchaseTaxInvoiceScanHint,
  layout?: LayoutExtract
): boolean {
  if (purchaseTaxLayoutWeakRegions(layout).length) return true
  if (invoiceConflictsWithVendorHint(row, hint)) return true
  if (purchaseTaxInvoiceTextExtractIsComplete(row, hint)) return false
  return true
}

export function mergePurchaseTaxInvoiceExtract(
  primary: ExtractedPurchaseTaxInvoiceFields | null | undefined,
  secondary: ExtractedPurchaseTaxInvoiceFields | null | undefined
): ExtractedPurchaseTaxInvoiceFields | null {
  if (!primary && !secondary) return null
  const row: ExtractedPurchaseTaxInvoiceFields = {
    docDate: primary?.docDate || secondary?.docDate,
    invoiceNo: preferPlausibleInvoiceNo(primary?.invoiceNo, secondary?.invoiceNo),
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

function invoiceFromPageBeatsCurrent(fromPage: string, current?: string): boolean {
  if (!current) return true
  const page = String(fromPage || '').trim()
  const cur = String(current || '').trim()
  if (!page || page === cur) return false
  if (isTruncatedShopeeInvoiceNo(cur) && !isTruncatedShopeeInvoiceNo(page)) return true
  if (isTruncatedShopeeInvoiceNo(cur) && page.startsWith('TRS')) return page.length > cur.length
  if (/^[IT]M20/i.test(page) && /^[IT1]M20/i.test(cur) && page.length >= cur.length) return true
  if (/^\d{6}[EFH]/i.test(page) && !/^\d{6}[EFH]/i.test(cur)) return true
  if (/^370\d{6}W\d+$/i.test(page) && !/^370\d{6}W\d+$/i.test(cur)) return true
  if (page.startsWith('TRS') && cur.startsWith('TRS') && page.length > cur.length + 4) return true
  if (officeInvoiceRank(page) > officeInvoiceRank(cur)) return true
  return false
}

/**
 * 글자층·QR·OCR 결과를 세금계산서 규칙으로 보정.
 * 매수자 TIN을 판매자로 넣었거나, 부가세 포함액을 공급가로 넣은 경우를 바로잡음.
 */
export function repairExtractedPurchaseTaxInvoice(
  row: ExtractedPurchaseTaxInvoiceFields,
  hint?: PurchaseTaxInvoiceScanHint
): ExtractedPurchaseTaxInvoiceFields {
  const buyerTin = digitsTin13(hint?.buyerTaxId)
  let sellerTaxId = row.sellerTaxId ? digitsTin13(row.sellerTaxId) : undefined
  if (sellerTaxId?.length !== 13 || !thaiTinChecksumOk(sellerTaxId)) sellerTaxId = undefined
  if (buyerTin && sellerTaxId === buyerTin) sellerTaxId = undefined

  let netAmount = row.netAmount
  let vatAmount = row.vatAmount
  let totalAmount = row.totalAmount
  const pageTextRaw = hint?.pageText || ''
  const fullyExempt = pageLooksFullyVatExempt(pageTextRaw)

  if (fullyExempt) {
    netAmount = 0
    vatAmount = 0
  }

  if (netAmount != null && vatAmount != null && totalAmount == null) {
    totalAmount = roundMoney2(netAmount + vatAmount)
  }
  if (!fullyExempt && netAmount != null && netAmount > 0 && totalAmount != null && vatAmount == null) {
    vatAmount = roundMoney2(Math.max(0, totalAmount - netAmount))
  }
  if (!fullyExempt && vatAmount != null && totalAmount != null && netAmount == null) {
    netAmount = roundMoney2(Math.max(0, totalAmount - vatAmount))
  }

  if (netAmount != null && vatAmount != null && vatAmount > 0 && purchaseTaxVatLooksWrong(netAmount, vatAmount)) {
    const excl = roundMoney2(netAmount / 1.07)
    if (!purchaseTaxVatLooksWrong(excl, vatAmount)) {
      netAmount = excl
      if (totalAmount == null) totalAmount = roundMoney2(netAmount + vatAmount)
    } else if (totalAmount != null && !purchaseTaxVatLooksWrong(roundMoney2(totalAmount - vatAmount), vatAmount)) {
      netAmount = roundMoney2(totalAmount - vatAmount)
    } else if (!(Math.abs(vatAmount - 7) < 0.2 && netAmount > 20)) {
      const wantNet = roundMoney2(vatAmount / 0.07)
      const pageNums = collectBahtAmounts(hint?.pageText || '')
      const hit = pageNums.find((n) => Math.abs(n - wantNet) <= 0.05)
      if (hit) {
        netAmount = hit
        totalAmount = roundMoney2(netAmount + vatAmount)
      } else if (Math.abs(netAmount - vatAmount) < 0.02) {
        // 공급가·부가세가 같은 숫자로 들어간 경우 — 부가세만 믿고 공급가는 7% 역산하거나 비운다
        if (wantNet >= 1 && wantNet < 500_000_000) {
          netAmount = wantNet
          totalAmount = roundMoney2(netAmount + vatAmount)
        } else {
          netAmount = undefined
          totalAmount = undefined
        }
      } else if (vatAmount < netAmount && wantNet >= 1 && wantNet < netAmount) {
        netAmount = wantNet
        totalAmount = roundMoney2(netAmount + vatAmount)
      }
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

  if ((netAmount == null || netAmount === 0) && vatAmount != null && vatAmount > 0.5 && Math.abs(vatAmount - 7) > 0.2) {
    const inferredNet = roundMoney2(vatAmount / 0.07)
    if (inferredNet >= 1 && inferredNet < 500_000_000) {
      netAmount = inferredNet
      if (totalAmount == null) totalAmount = roundMoney2(netAmount + vatAmount)
    }
  }

  if ((netAmount == null || netAmount === 0) && vatAmount != null && Math.abs(vatAmount - 7) < 0.001) {
    vatAmount = undefined
    if (totalAmount != null && Math.abs(totalAmount - 7) < 0.001) totalAmount = undefined
  }
  if (netAmount != null && vatAmount != null && vatAmount > 0 && purchaseTaxVatLooksWrong(netAmount, vatAmount)) {
    if (Math.abs(vatAmount - 7) < 0.001 && netAmount > 20) {
      vatAmount = roundMoney2(netAmount * 0.07)
      totalAmount = roundMoney2(netAmount + vatAmount)
    } else if (vatAmount > netAmount) {
      vatAmount = undefined
      totalAmount = undefined
    }
  }

  const pageNums = collectBahtAmounts(hint?.pageText || '')
  const fromPageAmt = pickExclusiveVatAmounts(pageNums)
  const exemptZeroPair = netAmount === 0 && vatAmount === 0
  const amountsBroken =
    !exemptZeroPair &&
    (netAmount == null ||
      vatAmount == null ||
      vatAmount === 0 ||
      (vatAmount > 0 && purchaseTaxVatLooksWrong(netAmount, vatAmount)) ||
      (netAmount != null && amountLooksLikeOcrFragment(netAmount, pageNums)))
  if (
    fromPageAmt &&
    (amountsBroken ||
      (netAmount != null && netAmount < 80 && fromPageAmt.netAmount >= Math.max(200, netAmount * 4)))
  ) {
    netAmount = fromPageAmt.netAmount
    vatAmount = fromPageAmt.vatAmount
    totalAmount = fromPageAmt.totalAmount
  }
  const netAmt = netAmount
  const vatAmt = vatAmount
  const netOnPage =
    netAmt != null && pageNums.some((p) => Math.abs(p - netAmt) <= 0.05)
  const repeatedPageNets = [...new Set(pageNums.filter((n) => n >= 1))].filter(
    (n) => pageNums.filter((x) => Math.abs(x - n) < 0.02).length >= 2
  )
  const repeatedNet = repeatedPageNets.slice().sort((a, b) => b - a)[0]
  const vatOk =
    netAmt != null && vatAmt != null && vatAmt > 0 && !purchaseTaxVatLooksWrong(netAmt, vatAmt)
  const vatOnPage = vatAmt != null && pageNums.some((p) => Math.abs(p - vatAmt) <= 0.05)
  const keepDerivedPair = vatOk && vatOnPage
  const shouldFillFromRepeated =
    !keepDerivedPair &&
    Boolean(repeatedNet) &&
    /ภาษีมูลค่าเพิ่ม|VAT\s*7|ใบกำกับภาษี/i.test(pageTextRaw) &&
    !fullyExempt &&
    !/ยกเว้นภาษี|ยกเว้น\s*VAT|vat\s*exempt/i.test(pageTextRaw) &&
    (netAmount == null || !netOnPage)
  if (!fromPageAmt && !fullyExempt && shouldFillFromRepeated && repeatedNet) {
    netAmount = repeatedNet
    vatAmount = roundMoney2(repeatedNet * 0.07)
    totalAmount = roundMoney2(netAmount + vatAmount)
  } else if (
    !fromPageAmt &&
    netOnPage &&
    netAmount != null &&
    repeatedNet != null &&
    Math.abs(repeatedNet - netAmount) < 0.05 &&
    (vatAmount == null || vatAmount === 0) &&
    /ภาษีมูลค่าเพิ่ม|VAT\s*7|ใบกำกับภาษี/i.test(pageTextRaw) &&
    !fullyExempt &&
    !/ยกเว้นภาษี|ยกเว้น\s*VAT|vat\s*exempt/i.test(pageTextRaw)
  ) {
    vatAmount = roundMoney2(netAmount * 0.07)
    totalAmount = roundMoney2(netAmount + vatAmount)
  }
  if (
    !fullyExempt &&
    !fromPageAmt &&
    netAmount != null &&
    netAmount > 20 &&
    (vatAmount == null || vatAmount === 0)
  ) {
    const excl = roundMoney2(netAmount / 1.07)
    const vat = roundMoney2(netAmount - excl)
    const totalLabeled = extractAmountNear(pageTextRaw, /รวมทั้งสิ้น|ยอดรวมสุทธิ|Grand\s*total|Amount\s*due/i)
    const netIsPrintedTotal = totalLabeled != null && Math.abs(totalLabeled - netAmount) <= 0.05
    const saysInclusive = /รวม\s*(?:VAT|ภาษี)/i.test(pageTextRaw)
    const exclOnPage = pageNums.some((p) => Math.abs(p - excl) <= 0.05 || Math.abs(p - vat) <= 0.05)
    if (vat >= 0.01 && !purchaseTaxVatLooksWrong(excl, vat) && (netIsPrintedTotal || saysInclusive || exclOnPage)) {
      netAmount = excl
      vatAmount = vat
      totalAmount = roundMoney2(excl + vat)
    }
  }
  if (
    !(netAmount === 0 && (vatAmount == null || vatAmount === 0)) &&
    netAmount != null &&
    netAmount > 0 &&
    netAmount < 5 &&
    (vatAmount == null || vatAmount < 1 || purchaseTaxVatLooksWrong(netAmount, vatAmount))
  ) {
    netAmount = undefined
    if (vatAmount != null && vatAmount < 1) vatAmount = undefined
    totalAmount = undefined
  }
  if (
    (fullyExempt || (netAmount === 0 && !pageHasTaxableVatPair(pageTextRaw))) &&
    (netAmount == null || netAmount === 0) &&
    (vatAmount == null || vatAmount === 0)
  ) {
    netAmount = 0
    vatAmount = 0
  }
  if (
    vatAmount === 0 &&
    netAmount != null &&
    netAmount > 20 &&
    (totalAmount == null || Math.abs(totalAmount - netAmount) > 0.05)
  ) {
    vatAmount = undefined
  }

  if (sellerTaxId && netAmount != null && netAmount > 0) {
    const typical = hint?.learnedNetsByTin?.[sellerTaxId] || []
    if (netLooksImplausiblySmallForTin(netAmount, typical)) {
      if (fromPageAmt && !netLooksImplausiblySmallForTin(fromPageAmt.netAmount, typical)) {
        netAmount = fromPageAmt.netAmount
        vatAmount = fromPageAmt.vatAmount
        totalAmount = fromPageAmt.totalAmount
      } else {
        netAmount = undefined
        vatAmount = undefined
        totalAmount = undefined
      }
    }
  }

  let invoiceNo = String(row.invoiceNo || '').trim() || undefined
  if (invoiceNo) {
    invoiceNo =
      recoverShopeeInvoiceNo(invoiceNo, hint?.taxMonth) ||
      recoverGrabInvoiceNo(invoiceNo, sellerTaxId, hint?.taxMonth) ||
      recoverKasikornInvoiceNo(invoiceNo) ||
      cleanInvoiceNo(invoiceNo) ||
      (invoiceNoLooksPlausible(invoiceNo) ? compactInvoiceToken(invoiceNo) : undefined)
  }
  const pageText = hint?.pageText || ''
  if (pageText) {
    const fromPage =
      recoverShopeeInvoiceNo(pageText, hint?.taxMonth) ||
      recoverGrabInvoiceNo(pageText, sellerTaxId, hint?.taxMonth) ||
      recoverKasikornInvoiceNo(pageText)
    if (fromPage && invoiceFromPageBeatsCurrent(fromPage, invoiceNo)) invoiceNo = fromPage
    const prefixed = invoiceNo ? attachOfficePrefix(pageText, invoiceNo) : undefined
    if (prefixed) invoiceNo = prefixed
    if (invoiceNo) invoiceNo = snapRvInvoiceToTaxMonth(invoiceNo, hint?.taxMonth)
    const vendorHint = sellerTaxId ? hint?.vendorHints?.get(sellerTaxId) : undefined
    if (vendorHint) {
      if (!invoiceNo || !invoiceMatchesVendorHint(invoiceNo, vendorHint)) {
        const recovered = findInvoiceTokenInText(pageText, vendorHint)
        if (recovered) invoiceNo = recovered
      } else if (!/[A-Za-z]/.test(invoiceNo)) {
        invoiceNo = restoreInvoiceWithVendorHint(invoiceNo, vendorHint)
      }
    }
  }
  // 세금번호(앞 0이 빠진 12자리 포함)가 문서번호로 잡힌 경우
  const invDigits = invoiceNo ? invoiceNo.replace(/\D/g, '') : ''
  if (invoiceNo && invDigits.length >= 8) {
    if (sellerTaxId && sellerTaxId.includes(invDigits)) invoiceNo = undefined
    else if (buyerTin && (buyerTin.includes(invDigits) || buyerTin.slice(1) === invDigits)) invoiceNo = undefined
  }
  const pageTins = extractTins(pageText).filter((tin) => tin !== buyerTin)
  if (pageTins.length) {
    if (!sellerTaxId) sellerTaxId = pageTins[0]
  }

  const trsToken = pageText.match(/TRS[A-Z]{2,10}00[^\s]*/i)?.[0]
  const inferredSeller =
    (invoiceNo ? inferSellerFromInvoiceNo(invoiceNo, sellerTaxId) : null) ||
    (trsToken ? inferSellerFromInvoiceNo(trsToken, sellerTaxId) : null)
  if (inferredSeller) {
    sellerTaxId = inferredSeller.tin
  }
  let sellerName = String(row.sellerName || '').trim()
  sellerName = trimPurchaseTaxSellerName(sellerName)
  if (looksLikeJunkSellerName(sellerName)) sellerName = ''
  if (sellerName && nameLooksLikeBuyerHint(sellerName, hint?.buyerName)) sellerName = ''
  if (sellerName && pageText) {
    const otherTins = extractTins(pageText).filter((tin) => tin !== sellerTaxId)
    for (const tin of otherTins) {
      const nearBuyer = companyNameNearTin(pageText, tin)
      if (nearBuyer && sellerNamesShareCompany(sellerName, nearBuyer)) {
        sellerName = ''
        break
      }
    }
  }
  const nearSeller = sellerTaxId && pageText ? companyNameNearTin(pageText, sellerTaxId) : undefined
  if (nearSeller && (!sellerName || looksLikeJunkSellerName(sellerName))) sellerName = nearSeller
  const knownName = sellerTaxId ? KNOWN_TIN_SELLER_NAMES[sellerTaxId] : undefined
  if (knownName) sellerName = knownName
  else if (!sellerName && inferredSeller) sellerName = inferredSeller.name
  const sellerBranch = row.sellerBranch || undefined

  const fromInvDate = invoiceNo ? inferDocDateFromInvoiceNo(invoiceNo) : undefined
  const labeledDate = snapDocDateYearToTaxPeriod(row.docDate, hint?.taxMonth)
  const invDate = snapDocDateYearToTaxPeriod(fromInvDate, hint?.taxMonth)
  let docDate = labeledDate || invDate
  if (fromInvDate && labeledDate && Math.abs(Number(labeledDate.slice(0, 4)) - Number(fromInvDate.slice(0, 4))) >= 2) {
    docDate = invDate || fromInvDate
  } else if (
    fromInvDate &&
    docDate &&
    fromInvDate.slice(0, 4) === docDate.slice(0, 4) &&
    fromInvDate.slice(5, 7) !== docDate.slice(5, 7)
  ) {
    docDate = fromInvDate
  }

  if (invoiceNo) invoiceNo = shopeeUniqueInvoiceTail(invoiceNo) || invoiceNo

  return {
    ...row,
    invoiceNo,
    docDate,
    sellerName: sellerName || undefined,
    sellerTaxId,
    sellerBranch,
    netAmount,
    vatAmount,
    totalAmount,
  }
}

