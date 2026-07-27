import { stripPosSplitReceiptsMarker } from '@/lib/pos-split-receipt-memo'

/** POS 세금계산서 수취인 마스터 DB `store_code` — 전 매장 공유 풀 */
export const POS_TAX_INVOICE_SHARED_STORE_CODE = '__shared__'

export type PosTaxInvoiceCustomerType = 'person' | 'company'

export interface PosTaxInvoiceData {
  memberNo: string
  customerType: PosTaxInvoiceCustomerType
  name: string
  taxId: string
  branchNo: string
  phone: string
  email: string
  address: string
  member: boolean
}

/** 주문 memo 토큰 값에 `|`, `=` 등이 있어도 파싱되도록 저장 시 사용 */
export function encodeTaxInvoiceMemoValue(value: string): string {
  return encodeURIComponent(String(value ?? ''))
}

export function decodeTaxInvoiceMemoValue(raw: string): string {
  const s = String(raw ?? '')
  if (!s) return ''
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** 80mm 영수증 — 세금계산서 수취인 필드(라벨 위·값 아래, 좌우 2열 낭비 없음) */
function taxInvoiceThermalStackRow(
  esc: (s: string) => string,
  label: string,
  value: string
): string {
  const v = String(value ?? '').trim()
  if (!v) return ''
  return (
    '<div class="tax-inv-stack-row" style="margin:5px 0">' +
    '<div style="font-size:9px;font-weight:700;color:#111;line-height:1.25">' +
    esc(label) +
    '</div>' +
    '<div style="font-size:11px;line-height:1.38;margin-top:1px;overflow-wrap:anywhere;word-break:break-word">' +
    esc(v) +
    '</div></div>'
  )
}

/**
 * 80mm 등 단순 영수증 HTML — 태국 Tax Invoice 수취인(ผู้ซื้อ) 필수 표기
 */
export function buildPosTaxInvoiceThermalHtml(opts: {
  taxInvoice: PosTaxInvoiceData
  esc: (s: string) => string
  tr: (key: string, fallback: string) => string
}): string {
  const { taxInvoice, esc, tr } = opts
  const branchDisplay =
    taxInvoice.branchNo ||
    (taxInvoice.customerType === 'company' ? '00000' : tr('posHeadOffice', '본점'))
  const typeLabel =
    taxInvoice.customerType === 'company'
      ? tr('posTaxCustomerCorporate', '법인')
      : tr('posTaxCustomerIndividual', '개인')
  const rows = [
    taxInvoiceThermalStackRow(esc, tr('posTaxCustomerTypeLabel', '구분'), typeLabel),
    taxInvoiceThermalStackRow(esc, tr('posName', '이름'), taxInvoice.name),
    taxInvoiceThermalStackRow(esc, tr('posTaxIdLabel', 'Tax ID'), taxInvoice.taxId),
    taxInvoiceThermalStackRow(esc, tr('posBranchLabel', '지점'), branchDisplay),
    taxInvoiceThermalStackRow(esc, tr('settings_address', '주소'), taxInvoice.address),
    taxInvoiceThermalStackRow(esc, tr('posPhone', '전화번호'), taxInvoice.phone),
    taxInvoiceThermalStackRow(esc, tr('posTaxEmailLabel', 'E-mail'), taxInvoice.email),
  ].join('')
  return (
    '<div style="border:1px solid #000;padding:6px 8px;margin:8px 0;font-size:11px;line-height:1.35;text-align:left">' +
    '<div style="font-weight:700;margin-bottom:6px;text-align:center;font-size:12px">' +
    esc(tr('posReceiptTaxInvoice', '세금계산서')) +
    '</div>' +
    rows +
    '</div>'
  )
}

export interface ParsedPosOrderMemo {
  plainMemo: string
  taxInvoice: PosTaxInvoiceData | null
}

export const TAX_INVOICE_MARKER = '[TAX_INVOICE]'

const POS_INTERNAL_MEMO_STAMP_PREFIX =
  /^\[(?:PAY_CORRECT|ORDER_(?:CANCELLED|REFUNDED|MERGED|MERGE_KEEP))\s+[^\]]*\]\s*(.*)$/i

/** 동일 스탬프가 한 줄 안에 여러 번 붙은 경우 */
const POS_INTERNAL_MEMO_STAMP_INLINE =
  /\[(?:PAY_CORRECT|ORDER_(?:CANCELLED|REFUNDED|MERGED|MERGE_KEEP))\s+[^\]]*\]/gi

function stripInternalMemoLine(line: string): string {
  const t = String(line || '').trim()
  if (!t) return ''
  const prefixed = POS_INTERNAL_MEMO_STAMP_PREFIX.exec(t)
  if (prefixed) {
    const rest = String(prefixed[1] || '').trim()
    if (!rest) return ''
    const parts = rest.split('|').map((p) => p.trim()).filter(Boolean)
    if (parts.length > 1) return parts.slice(1).join(' | ')
    return ''
  }
  return t.replace(POS_INTERNAL_MEMO_STAMP_INLINE, '').trim()
}

function stripPosInternalMemoTokens(input: string): string {
  let text = stripPosSplitReceiptsMarker(String(input || '').trim())
  if (!text) return ''
  // 플랫폼·POS 내부 추적 토큰은 손님 메모에서 숨긴다.
  text = text
    .split(/\r?\n/)
    .map(stripInternalMemoLine)
    .filter(Boolean)
    .join('\n')
  text = text.replace(POS_INTERNAL_MEMO_STAMP_INLINE, '')
  text = text
    .replace(/\b(grab|lineman|shopee)_order:[A-Za-z0-9._:-]+/gi, '')
    .replace(/\|?\s*grab_state:[A-Za-z0-9._-]+/gi, '')
    .replace(/\|?\s*(grab|lineman|shopee)_state:[A-Za-z0-9._-]+/gi, '')
    .replace(/\|\s*\|+/g, '|')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[|,\s]+|[|,\s]+$/g, '')
  return text.trim()
}

/** `[TAX_INVOICE]` 앞에 운영 스탬프를 붙인다(블록 뒤에 붙이면 address 파싱이 깨짐). */
export function appendPosInternalMemoStamp(memo: string | undefined | null, stamp: string): string {
  const raw = String(memo ?? '').trim()
  const line = String(stamp ?? '').trim()
  if (!line) return raw
  const markerIndex = raw.indexOf(TAX_INVOICE_MARKER)
  if (markerIndex < 0) return raw ? `${raw}\n${line}` : line
  const before = raw.slice(0, markerIndex).trimEnd()
  const taxSection = raw.slice(markerIndex).trimStart()
  const nextBefore = before ? `${before}\n${line}` : line
  return `${nextBefore} ${taxSection}`.trim()
}

function stripInternalStampsFromTaxInvoicePayload(payload: string): string {
  let text = String(payload || '').trim()
  if (!text) return ''
  text = text.replace(/\r?\n\[(?:PAY_CORRECT|ORDER_(?:CANCELLED|REFUNDED|MERGED|MERGE_KEEP))\s+[^\]]*\][^\r\n]*/gi, '')
  return text.replace(POS_INTERNAL_MEMO_STAMP_INLINE, '').trim()
}

function sanitizeTaxInvoiceFieldValue(raw: string): string {
  return stripPosInternalMemoTokens(decodeTaxInvoiceMemoValue(raw))
}

export function parsePosOrderMemo(memo: string | undefined | null): ParsedPosOrderMemo {
  const raw = String(memo || '')
  if (!raw.trim()) return { plainMemo: '', taxInvoice: null }

  const markerIndex = raw.indexOf(TAX_INVOICE_MARKER)
  if (markerIndex < 0) return { plainMemo: stripPosInternalMemoTokens(raw), taxInvoice: null }

  const plainMemo = stripPosInternalMemoTokens(raw.slice(0, markerIndex))
  const payloadRaw = stripInternalStampsFromTaxInvoicePayload(
    raw.slice(markerIndex + TAX_INVOICE_MARKER.length)
  )
  const parsed: Record<string, string> = {}

  for (const token of payloadRaw.split('|')) {
    const part = token.trim()
    if (!part) continue
    const eqIndex = part.indexOf('=')
    if (eqIndex < 0) continue
    const key = part.slice(0, eqIndex).trim()
    const value = part.slice(eqIndex + 1).trim()
    if (!key) continue
    parsed[key] = value
  }

  const customerType: PosTaxInvoiceCustomerType =
    parsed.customerType === 'company' ? 'company' : 'person'
  const taxInvoice: PosTaxInvoiceData = {
    memberNo: sanitizeTaxInvoiceFieldValue(parsed.memberNo || ''),
    customerType,
    name: sanitizeTaxInvoiceFieldValue(parsed.name || ''),
    taxId: sanitizeTaxInvoiceFieldValue(parsed.taxId || '').replace(/\D/g, ''),
    branchNo: sanitizeTaxInvoiceFieldValue(parsed.branchNo || '').replace(/\D/g, ''),
    phone: sanitizeTaxInvoiceFieldValue(parsed.phone || ''),
    email: sanitizeTaxInvoiceFieldValue(parsed.email || ''),
    address: sanitizeTaxInvoiceFieldValue(parsed.address || ''),
    member: parsed.member === 'Y',
  }

  const hasMeaningfulData = Boolean(
    taxInvoice.name ||
    taxInvoice.taxId ||
    taxInvoice.branchNo ||
    taxInvoice.phone ||
    taxInvoice.email ||
    taxInvoice.address ||
    taxInvoice.memberNo
  )
  return { plainMemo, taxInvoice: hasMeaningfulData ? taxInvoice : null }
}

function stripTaxInvoiceSectionFromMemoRaw(memo: string | undefined | null): string {
  const raw = String(memo || '')
  if (!raw.trim()) return ''
  const markerIndex = raw.indexOf(TAX_INVOICE_MARKER)
  if (markerIndex < 0) return raw.trim()
  return raw.slice(0, markerIndex).trim()
}

/** 홀 주문서·일반 손님 영수증 등 — memo에서 `[TAX_INVOICE]` 블록만 제거(표시용) */
export function stripPosOrderTaxInvoiceFromMemo(memo: string | undefined | null): string {
  return stripTaxInvoiceSectionFromMemoRaw(memo)
}

/** 기존 memo의 `[TAX_INVOICE]` 블록을 교체(또는 신규 추가)한다. */
/** 결제 영수증 세금계산서 재인쇄 dedupe·변경 감지용 */
export function posTaxInvoiceReceiptFingerprint(
  tax: PosTaxInvoiceData | null | undefined
): string {
  if (!tax) return ''
  return [
    tax.taxId,
    tax.branchNo || '00000',
    tax.name,
    tax.phone,
    tax.address,
  ].join('|')
}

/** 결제 완료 후 memo에 세금계산서가 추가·변경되면 결제 영수증 재인쇄가 필요한지 */
export function shouldReprintPaymentReceiptForTaxInvoiceMemoChange(
  oldMemo: string | null | undefined,
  newMemo: string | null | undefined
): boolean {
  const oldFp = posTaxInvoiceReceiptFingerprint(parsePosOrderMemo(oldMemo).taxInvoice)
  const newFp = posTaxInvoiceReceiptFingerprint(parsePosOrderMemo(newMemo).taxInvoice)
  if (!newFp) return false
  return oldFp !== newFp
}

export function upsertPosOrderTaxInvoiceMemo(
  memo: string | undefined | null,
  taxInvoice: PosTaxInvoiceData
): string {
  const baseMemo = stripTaxInvoiceSectionFromMemoRaw(memo)
  const normalizedTaxId = String(taxInvoice.taxId || '').replace(/\D/g, '').slice(0, 13)
  const normalizedBranchNo = String(taxInvoice.branchNo || '').replace(/\D/g, '').slice(0, 5)
  const normalizedPhone = String(taxInvoice.phone || '').trim()
  const normalizedEmail = String(taxInvoice.email || '').trim()
  const normalizedAddress = String(taxInvoice.address || '').trim()
  const normalizedName = String(taxInvoice.name || '').trim()
  const normalizedMemberNo = String(taxInvoice.memberNo || '').trim()
  const customerType: PosTaxInvoiceCustomerType =
    taxInvoice.customerType === 'company' ? 'company' : 'person'
  const branchNoForMemo = customerType === 'company' ? normalizedBranchNo : (normalizedBranchNo || '00000')
  const tokens = [
    `memberNo=${encodeTaxInvoiceMemoValue(normalizedMemberNo)}`,
    `member=${taxInvoice.member ? 'Y' : 'N'}`,
    `customerType=${customerType}`,
    `name=${encodeTaxInvoiceMemoValue(normalizedName)}`,
    `taxId=${encodeTaxInvoiceMemoValue(normalizedTaxId)}`,
    `branchNo=${encodeTaxInvoiceMemoValue(branchNoForMemo)}`,
    `phone=${encodeTaxInvoiceMemoValue(normalizedPhone)}`,
    `email=${encodeTaxInvoiceMemoValue(normalizedEmail)}`,
    `address=${encodeTaxInvoiceMemoValue(normalizedAddress)}`,
  ].join('|')
  return [baseMemo, `${TAX_INVOICE_MARKER} ${tokens}`].filter(Boolean).join(' ').trim()
}
