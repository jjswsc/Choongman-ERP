const RE_TAX_INVOICE_DOC_SUFFIX = /IV\.\d{8}-(\d{3})\b/i

function bangkokTodayDigits(): string {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 10).replace(/\D/g, '')
}

/** Tax Invoice/Receipt 문서번호 — IV.YYYYMMDD-NNN (NNN = 당일 입금 처리 순번) */
export function buildTaxInvoiceDocNo(issueDate: string, seq: number): string {
  const dateDigits = String(issueDate || '').replace(/\D/g, '')
  const safeDate = dateDigits.length >= 8 ? dateDigits.slice(0, 8) : bangkokTodayDigits()
  const suffix = String(Math.max(1, Math.floor(Number(seq) || 1))).padStart(3, '0')
  return `IV.${safeDate}-${suffix}`
}

/** 출고·미수 목록용 IVYYYYMMDD-orderId (Tax Invoice 문서번호와 구분) */
export function isOutboundReceivableInvoiceNo(value: string | undefined | null): boolean {
  return /^IV\d{8}-\d+$/i.test(String(value || '').trim())
}

/** Tax Invoice 문서번호 IV.YYYYMMDD-NNN */
export function isTaxInvoiceDocumentNo(value: string | undefined | null): boolean {
  return /^IV\.\d{8}-\d+$/i.test(String(value || '').trim())
}

/** 기존 문서번호에서 순번(마지막 3자리) 추출 — 인쇄 화면 수정 시 보존용 */
export function parseTaxInvoiceDocNoSuffix(documentNo: string | undefined | null): number | null {
  const m = String(documentNo || '').match(RE_TAX_INVOICE_DOC_SUFFIX)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}
