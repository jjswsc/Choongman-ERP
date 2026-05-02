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
  const row = (label: string, value: string) =>
    '<div style="margin:2px 0;overflow-wrap:anywhere;word-break:break-word"><span style="font-weight:700">' +
    esc(label) +
    ':</span> ' +
    esc(value) +
    '</div>'
  return (
    '<div style="border:1px solid #000;padding:6px;margin:8px 0;font-size:11px;line-height:1.35;text-align:left">' +
    '<div style="font-weight:700;margin-bottom:4px;text-align:center">' +
    esc(tr('posReceiptTaxInvoice', '세금계산서')) +
    '</div>' +
    row(tr('posTaxCustomerTypeLabel', '구분'), typeLabel) +
    row(tr('posName', '이름'), taxInvoice.name) +
    row(tr('posTaxIdLabel', 'Tax ID'), taxInvoice.taxId) +
    row(tr('posBranchLabel', '지점'), branchDisplay) +
    row(tr('settings_address', '주소'), taxInvoice.address) +
    row(tr('posPhone', '전화번호'), taxInvoice.phone) +
    row(tr('posTaxEmailLabel', 'E-mail'), taxInvoice.email) +
    '</div>'
  )
}

export interface ParsedPosOrderMemo {
  plainMemo: string
  taxInvoice: PosTaxInvoiceData | null
}

export const TAX_INVOICE_MARKER = '[TAX_INVOICE]'

function stripPosInternalMemoTokens(input: string): string {
  let text = String(input || '').trim()
  if (!text) return ''
  // 플랫폼 내부 추적 토큰은 손님 메모에서 숨긴다.
  text = text
    .replace(/\b(grab|lineman|shopee)_order:[A-Za-z0-9._:-]+/gi, '')
    .replace(/\|?\s*grab_state:[A-Za-z0-9._-]+/gi, '')
    .replace(/\|?\s*(grab|lineman|shopee)_state:[A-Za-z0-9._-]+/gi, '')
    .replace(/\|\s*\|+/g, '|')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[|,\s]+|[|,\s]+$/g, '')
  return text.trim()
}

export function parsePosOrderMemo(memo: string | undefined | null): ParsedPosOrderMemo {
  const raw = String(memo || '')
  if (!raw.trim()) return { plainMemo: '', taxInvoice: null }

  const markerIndex = raw.indexOf(TAX_INVOICE_MARKER)
  if (markerIndex < 0) return { plainMemo: stripPosInternalMemoTokens(raw), taxInvoice: null }

  const plainMemo = stripPosInternalMemoTokens(raw.slice(0, markerIndex))
  const payloadRaw = raw.slice(markerIndex + TAX_INVOICE_MARKER.length).trim()
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
    memberNo: decodeTaxInvoiceMemoValue(parsed.memberNo || ''),
    customerType,
    name: decodeTaxInvoiceMemoValue(parsed.name || ''),
    taxId: decodeTaxInvoiceMemoValue(parsed.taxId || '').replace(/\D/g, ''),
    branchNo: decodeTaxInvoiceMemoValue(parsed.branchNo || '').replace(/\D/g, ''),
    phone: decodeTaxInvoiceMemoValue(parsed.phone || ''),
    email: decodeTaxInvoiceMemoValue(parsed.email || ''),
    address: decodeTaxInvoiceMemoValue(parsed.address || ''),
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

/** 기존 memo의 `[TAX_INVOICE]` 블록을 교체(또는 신규 추가)한다. */
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
