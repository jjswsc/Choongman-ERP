/**
 * ใบกำกับภาษีซื้อ 전용 스캔 파이프라인 (GPT 없음).
 * (1) PDF 글자층 (2) QR (jsQR·URL·파이프) (3) 브라우저 태국어 OCR (4) 매수자 TIN 힌트·금액 교차검증.
 */

import { formatSellerBranch, digitsTin13, isLikelyTaxInvoiceCopy, looksLikeJunkSellerName, purchaseTaxInvoiceHasExtractedFields, purchaseTaxVatLooksWrong, thaiTinChecksumOk, type ExtractedPurchaseTaxInvoiceFields } from '@/lib/purchase-tax-invoice-core'
import { roundMoney2 } from '@/lib/invoice-vat-total'

export type PurchaseTaxInvoiceScanHint = {
  buyerTaxId?: string
  buyerName?: string
  pageText?: string
  taxMonth?: string
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
  const v = money
    ? Number(money[0].replace(/,/g, ''))
    : (() => {
        const n = s.match(/\d{1,7}(?!\d)/)
        if (!n || n[0] === '7') return NaN
        return Number(n[0])
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

/** OCR이 2565/2022처럼 연도만 어긋난 경우 조회 연도로 맞춤. 월·일은 유지. */
export function snapDocDateYearToTaxPeriod(ymd: string | undefined, taxMonth?: string): string | undefined {
  const date = String(ymd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ymd
  const wantY = Number(String(taxMonth || '').slice(0, 4))
  const y = Number(date.slice(0, 4))
  if (!Number.isFinite(wantY) || wantY < 1990 || wantY > 2100) return date
  const delta = Math.abs(y - wantY)
  if (delta >= 2 && delta <= 8) return `${String(wantY).padStart(4, '0')}${date.slice(4)}`
  return date
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
  return String(raw || '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, '')
    .trim()
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
  if (/^TRS[A-Z0-9]{0,8}PF00-?$/i.test(inv)) return false
  if (/^IM20\d{0,11}$/i.test(compact) && compact.length < 16) return false
  if (!/[A-Za-z]/.test(compact) && compact.length < 4) return false
  return true
}

function cleanInvoiceNo(raw: string): string | undefined {
  const inv = compactInvoiceToken(raw)
  if (!inv) return undefined
  const onlyDigits = inv.replace(/\D/g, '')
  if (!/[A-Za-z]/.test(inv) && onlyDigits.length === 13) return undefined
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(inv) && parseTaxInvoiceDateFromText(inv)) return undefined
  if (!/^[A-Z0-9][A-Z0-9\-/]{1,64}$/i.test(inv)) return undefined
  if (!invoiceNoLooksPlausible(inv)) return undefined
  return inv.slice(0, 80)
}

const PLATFORM_INVOICE_RE =
  /\b(TRS[A-Z]{0,8}\s*PF0[0CO]\s*-\s*\d{5}\s*-\s*\d{6}\s*-\s*\d{5,8}|IM\s*20\d{2}\s*\d{10,12}|LMRN\s*[A-Z0-9]{8,20}|\d{6}\s*[A-EFH]\s*\d{7,14}|INV\s*-\s*\d{8,14}(?:\s*-\s*\d{2,4})?)\b/i

function platformInvoiceBlob(raw: string): string {
  return ocrFixDigitsInInvoiceBlob(String(raw || '').replace(/\s+/g, '')).replace(/PF0[CO]/gi, 'PF00')
}

function formatRecoveredShopeeInvoice(compact: string): string | undefined {
  const s = platformInvoiceBlob(compact)
  const m = s.match(/TRS[A-Z]{2,8}PF00-?(\d{5})-?(\d{6})-?(\d{5,8})/i)
  if (!m) return undefined
  const prefix = s.match(/TRS[A-Z]{2,8}PF00/i)?.[0]
  if (!prefix) return undefined
  return cleanInvoiceNo(`${prefix.toUpperCase()}-${m[1]}-${m[2]}-${m[3]}`)
}

function recoverShopeeInvoiceNo(text: string): string | undefined {
  const compact = platformInvoiceBlob(text)
  const full = formatRecoveredShopeeInvoice(compact)
  if (full) return full
  const prefix = compact.match(/TRS[A-Z]{2,8}PF00-?/i)
  const tail = compact.match(/(\d{5})-(\d{6})-(\d{5,8})/)
  if (prefix && tail) {
    return cleanInvoiceNo(`${prefix[0].replace(/-$/, '').toUpperCase()}-${tail[1]}-${tail[2]}-${tail[3]}`)
  }
  return undefined
}

function recoverGrabInvoiceNo(text: string, sellerTaxId?: string): string | undefined {
  const compact = platformInvoiceBlob(text)
  const full = compact.match(/IM20\d{12}/i)
  if (full) return cleanInvoiceNo(full[0].toUpperCase())
  const grabTin = sellerTaxId === '0105556090377' || compact.includes('0105556090377')
  if (!grabTin) return undefined
  const body = compact.match(/20\d{12}/)
  if (body) return cleanInvoiceNo(`IM${body[0]}`)
  const partial = compact.match(/IM(20\d{7,11})/i)
  if (!partial) return undefined
  const rest = compact.slice(compact.indexOf(partial[0]) + partial[0].length).replace(/\D/g, '')
  const digits = (partial[1] + rest).slice(0, 14)
  if (digits.length === 14) return cleanInvoiceNo(`IM${digits}`)
  return undefined
}

function recoverKasikornInvoiceNo(text: string): string | undefined {
  const compact = platformInvoiceBlob(text)
  const m = compact.match(/\d{6}[EFH]\d{7,14}/i)
  return m ? cleanInvoiceNo(m[0].toUpperCase()) : undefined
}

const INVOICE_LABEL_RE =
  /(?:เลขที่(?:ใบกำกับ(?:ภาษี)?)?|เลขท[ีิ]|Invoice\s*No\.?|Tax\s*Invoice\s*No\.?|Doc(?:ument)?\s*No\.?|\bNo\.?(?=\s*[:#]?[A-Z0-9]))\s*[:#.\-]*/gi

const INVOICE_LINE_STOP_RE =
  /วันที่|บริษัท|ห้างหุ้น|ห้าง|เลขประจำ|มูลค่า|ภาษีมูลค่า|ผู้ซื้อ|ผู้ขาย|สำนักงาน|สาขา\s*\d|Tax\s*ID|\bTIN\b/i

const OFFICE_INVOICE_RE =
  /\b((?:INV|IVT|NX|NC|RV|SI|CS|DCI|DOI|TIT|IV|TI|ABB|RT)[\-/]?[A-Z0-9\-/ ]{2,48}|\d{7,12})\b/gi

function invoiceNoFromLabeledSlice(slice: string): string | undefined {
  const sameLine = slice.split(/\r?\n/, 1)[0] || ''
  const cut = sameLine.split(INVOICE_LINE_STOP_RE)[0]
  const inv = cleanInvoiceNo(cut)
  if (inv) return inv
  const next = slice.match(/^(?:[^\S\r\n]*)\r?\n\s*([^\r\n]{2,80})/)
  if (!next) return undefined
  return cleanInvoiceNo(next[1].split(INVOICE_LINE_STOP_RE)[0])
}

function extractLabeledInvoiceNo(s: string): string | undefined {
  INVOICE_LABEL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = INVOICE_LABEL_RE.exec(s))) {
    const inv = invoiceNoFromLabeledSlice(s.slice(m.index + m[0].length))
    if (inv) return inv
  }
  return undefined
}

function firstOfficeInvoiceNo(s: string): string | undefined {
  OFFICE_INVOICE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = OFFICE_INVOICE_RE.exec(s))) {
    const inv = cleanInvoiceNo(m[1])
    if (inv) return inv
  }
  return undefined
}

function extractInvoiceNo(text: string, sellerTaxId?: string): string | undefined {
  const s = String(text || '')
  const compact = platformInvoiceBlob(s)
  const recovered =
    recoverShopeeInvoiceNo(s) || recoverGrabInvoiceNo(s, sellerTaxId) || recoverKasikornInvoiceNo(s)
  if (recovered) return recovered
  const platform = s.match(PLATFORM_INVOICE_RE) || compact.match(PLATFORM_INVOICE_RE)
  if (platform) {
    const inv = cleanInvoiceNo(platformInvoiceBlob(platform[1]))
    if (inv) return inv
  }
  return extractLabeledInvoiceNo(s) || firstOfficeInvoiceNo(s)
}

const KNOWN_INVOICE_SELLERS: Array<{ re: RegExp; tin: string; name: string }> = [
  { re: /^TRS[A-Z]{0,8}PF00-/i, tin: '0105558019581', name: 'บริษัท ช้อปปี้ (ประเทศไทย) จำกัด' },
  { re: /^IM20\d{12}$/i, tin: '0105556090377', name: 'บริษัท แกร็บแท็กซี่ (ประเทศไทย) จำกัด' },
  { re: /^LMRN/i, tin: '0105562160721', name: 'บริษัท ไลน์แมน (ประเทศไทย) จำกัด' },
  { re: /^\d{6}[EFH]\d+$/i, tin: '0107536000315', name: 'บริษัท ธนาคารกสิกรไทย จำกัด (มหาชน)' },
  { re: /^370\d+W\d+$/i, tin: '0107536000315', name: 'บริษัท ธนาคารกสิกรไทย จำกัด (มหาชน)' },
  { re: /^INV-\d{11}$/i, tin: '0105559082715', name: 'บริษัท โพลาร์ แบร์ มิชชั่น จำกัด' },
  { re: /^INV-\d{8}-\d{2,4}$/i, tin: '0135564019457', name: 'บริษัท ไทย แอ็กโกร เฟรช จำกัด' },
  { re: /^26\d{5,6}$/, tin: '0105550102497', name: 'บริษัท จีดูบัง (เอเชีย) จำกัด' },
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
    const cleaned = cleanInvoiceNo(s) || (invoiceNoLooksPlausible(s) ? compactInvoiceToken(s) : undefined)
    return cleaned && invoiceNoLooksPlausible(cleaned) ? cleaned : undefined
  }
  const aOk = norm(a)
  const bOk = norm(b)
  if (aOk && inferSellerFromInvoiceNo(aOk)) return aOk
  if (bOk && inferSellerFromInvoiceNo(bOk)) return bOk
  return aOk || bOk
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
  const s = platformInvoiceBlob(String(invoiceNo || '').trim())
  const im = s.match(/^IM(20\d{2})(\d{2})(\d{2})\d+$/i)
  if (im) return ymdFromParts(Number(im[1]), Number(im[2]), Number(im[3]))
  const lm = s.match(/^LMRN(20\d{2})(\d{2})(\d{2})/i)
  if (lm) return ymdFromParts(Number(lm[1]), Number(lm[2]), Number(lm[3]))
  const shopee = s.match(/^TRS[A-Z]{0,8}PF00-\d{5}-(\d{2})(\d{2})(\d{2})-\d+$/i)
  if (shopee) return ymdFromParts(2000 + Number(shopee[1]), Number(shopee[2]), Number(shopee[3]))
  const kb = s.match(/^(\d{2})(\d{2})(\d{2})[EFH]\d+$/i)
  if (kb) return ymdFromParts(2000 + Number(kb[3]), Number(kb[2]), Number(kb[1]))
  return undefined
}

function extractSellerBranchRaw(text: string): string | undefined {
  const s = String(text || '')
  if (/สำนักงานใหญ่|head\s*office|\bhq\b/i.test(s) && !/สาขา\s*\d/.test(s)) return 'สำนักงานใหญ่'
  const branch = s.match(/สาขา\s*[:.\-]?\s*(\d{1,5})/i)
  if (branch) return branch[1]
  return undefined
}

function extractSellerName(text: string, buyerName?: string): string | undefined {
  const s = String(text || '')
  const labeled = s.match(
    /(?:ผู้ขาย|ผู้จำหน่าย|ผู้ประกอบการ|Seller|Vendor)\s*[:\-]?\s*([^\n]{3,120})/i
  )
  if (labeled) {
    const name = labeled[1].replace(/\s{2,}/g, ' ').trim().slice(0, 200)
    if (name && !/ผู้ซื้อ|ลูกค้า|Buyer/i.test(name) && !looksLikeJunkSellerName(name)) return name
  }
  const co = s.match(/((?:บริษัท|ห้างหุ้นส่วน(?:จำกัด)?|ร้าน|ทรัสต์)\s+[^\n]{2,90}(?:จำกัด(?:\s*\(มหาชน\))?)?)/)
  if (co) {
    const name = co[1].replace(/\s{2,}/g, ' ').trim()
    const buyer = String(buyerName || '').trim()
    if (buyer && name.includes(buyer)) return undefined
    if (!looksLikeJunkSellerName(name)) return name.slice(0, 200)
  }
  return undefined
}

function lineLooksLikeWithholdingOrExempt(line: string): boolean {
  return /หัก\s*ณ\s*ที่จ่าย|withholding|\bwht\b|สินค้าเกษตรยกเว้น|ยกเว้นภาษี|vat\s*exempt/i.test(line)
}

function extractAmountNear(text: string, keywords: RegExp): number | undefined {
  const isVat = /ภาษีมูลค่าเพิ่ม|VAT\s*7|Vat amount|ภาษี\s*7/i.test(keywords.source)
  const lines = String(text || '').split(/\r?\n/)
  for (const line of lines) {
    if (lineLooksLikeWithholdingOrExempt(line)) continue
    const idx = line.search(keywords)
    if (idx < 0) continue
    let frag = line.slice(idx)
    if (isVat) frag = frag.split(/รวมทั้งสิ้น|ยอดรวมสุทธิ|Grand\s*total|Amount\s*due/i)[0]
    const v = moneyFromFragment(frag)
    if (v != null) return v
  }
  const usable = lines.filter((line) => !lineLooksLikeWithholdingOrExempt(line)).join(' ')
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

export function splitScanTextIntoInvoiceBlocks(text: string): string[] {
  const raw = String(text || '')
  if (!raw.trim()) return []
  const qrs = [...raw.matchAll(/===QR===\s*([\s\S]*?)(?====|$)/g)]
    .map((m) => String(m[1] || '').trim())
    .filter((s) => s.length >= 8)
  const uniqueQrs = [...new Set(qrs)]
  if (uniqueQrs.length >= 2) {
    const qrInvoiceNos = uniqueQrs.map((q) => extractInvoiceNo(q)?.toUpperCase()).filter((n): n is string => !!n)
    const uniqueInv = [...new Set(qrInvoiceNos)]
    if (uniqueInv.length === 1 && qrInvoiceNos.length === uniqueQrs.length) return [raw]
    const rest = raw.replace(/===QR===\s*[\s\S]*?(?====|$)/g, '').trim()
    const lines = rest.split(/\n/)
    const mid = Math.max(1, Math.floor(lines.length / 2))
    return uniqueQrs.slice(0, 2).map((q, i) => {
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
  const uniqueInvoiceNos = [...new Set(invoiceNos)]
  if (markers.length >= 2 && (platformNos.length >= 2 || uniqueInvoiceNos.length >= 2)) {
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
  const seen = new Set<string>()
  for (const block of blocks.length ? blocks : [text]) {
    const row = extractPurchaseTaxInvoiceFromScanText(block, hint)
    if (!row || !purchaseTaxInvoiceHasExtractedFields(row)) continue
    const key = `${String(row.invoiceNo || '').replace(/\s+/g, '').toUpperCase()}|${digitsTin13(row.sellerTaxId)}`
    if (row.invoiceNo && seen.has(key)) continue
    seen.add(key)
    rows.push(row)
  }
  return rows
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
  const netAmount =
    extractAmountNear(raw, /มูลค่าสินค้า|มูลค่า(?!เพิ่ม)|ฐานภาษี|Taxable|Sub\s*total|Net\s*amount/i) ??
    extractAmountNear(raw, /ก่อนภาษี|ก่อน VAT/i)
  const vatAmount = extractAmountNear(raw, /ภาษีมูลค่าเพิ่ม|VAT\s*7|Vat amount|ภาษี\s*7/i)
  const totalAmount = extractAmountNear(raw, /รวมทั้งสิ้น|ยอดรวมสุทธิ|Grand\s*total|Amount\s*due/i)
  const inferred = inferAmountsFromMoneySequence(raw)
  const row: ExtractedPurchaseTaxInvoiceFields = {
    docDate: parseTaxInvoiceDateFromText(raw),
    invoiceNo: extractInvoiceNo(raw, sellerTaxId),
    sellerName: extractSellerName(raw, hint?.buyerName),
    sellerTaxId: sellerTaxId && sellerTaxId.length === 13 && thaiTinChecksumOk(sellerTaxId) ? sellerTaxId : undefined,
    sellerBranch: formatSellerBranch(extractSellerBranchRaw(raw)),
    netAmount: netAmount ?? inferred?.netAmount,
    vatAmount: vatAmount ?? inferred?.vatAmount,
    totalAmount: totalAmount ?? inferred?.totalAmount,
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
    } else if (!(Math.abs(vatAmount - 7) < 0.2 && netAmount > 20)) {
      const wantNet = roundMoney2(vatAmount / 0.07)
      const pageNums = collectBahtAmounts(hint?.pageText || '')
      const hit = pageNums.find((n) => Math.abs(n - wantNet) <= 0.05)
      if (hit) {
        netAmount = hit
        totalAmount = roundMoney2(netAmount + vatAmount)
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

  let invoiceNo = String(row.invoiceNo || '').trim() || undefined
  if (invoiceNo) {
    invoiceNo =
      recoverShopeeInvoiceNo(invoiceNo) ||
      recoverGrabInvoiceNo(invoiceNo, sellerTaxId) ||
      recoverKasikornInvoiceNo(invoiceNo) ||
      cleanInvoiceNo(invoiceNo) ||
      (invoiceNoLooksPlausible(invoiceNo) ? compactInvoiceToken(invoiceNo) : undefined)
  }
  const inferredSeller = invoiceNo ? inferSellerFromInvoiceNo(invoiceNo, sellerTaxId) : null
  if (inferredSeller) {
    if (!sellerTaxId) sellerTaxId = inferredSeller.tin
    else if (
      sellerTaxId !== inferredSeller.tin &&
      (sellerTaxId.slice(0, 12) === inferredSeller.tin.slice(0, 12) ||
        !sellerTaxId.startsWith('0') ||
        looksLikeJunkSellerName(row.sellerName))
    ) {
      sellerTaxId = inferredSeller.tin
    }
  }
  let sellerName = String(row.sellerName || '').trim()
  if (looksLikeJunkSellerName(sellerName)) sellerName = ''
  const knownName = sellerTaxId ? KNOWN_TIN_SELLER_NAMES[sellerTaxId] : undefined
  if (knownName) sellerName = knownName
  else if (!sellerName && inferredSeller) sellerName = inferredSeller.name
  const sellerBranch =
    row.sellerBranch || (sellerTaxId && KNOWN_TIN_SELLER_NAMES[sellerTaxId] ? 'สำนักงานใหญ่' : undefined)

  const docDate = snapDocDateYearToTaxPeriod(
    row.docDate || (invoiceNo ? inferDocDateFromInvoiceNo(invoiceNo) : undefined),
    hint?.taxMonth
  )

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

