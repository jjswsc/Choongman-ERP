const RE_TAX_INVOICE_DOC_SUFFIX = /IV\.\d{8}-(\d+)\b/i

function bangkokTodayDigits(): string {
  return new Date().toLocaleString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 10).replace(/\D/g, '')
}

/** Tax Invoice/Receipt 문서번호 — IV.YYYYMMDD-NNN (NNN = issueDate 기준 발행 순번) */
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

/** 회계발주 미수 원장 번호 APOYYYYMMDD-poId (발주 인쇄 Invoice No. PO-… 와 구분) */
export function isAccountingPoReceivableInvoiceNo(value: string | undefined | null): boolean {
  const v = String(value || '').trim()
  return /^APO\d{8}-\d+$/i.test(v) || /^APO#\d+$/i.test(v)
}

/**
 * Tax Invoice Reference로 쓰지 말아야 할 시스템 번호.
 * 회계 PO Invoice 인쇄는 po_no(PO-YYYYMMDD-xxxx)를 쓰므로 APO/IVF/IV. 는 원본 문서번호에 밀린다.
 */
export function isUnsuitableTaxInvoiceReferenceNo(
  referenceNo: string | undefined | null,
  documentNo?: string | undefined | null
): boolean {
  const ref = String(referenceNo || '').trim()
  if (!ref || ref === '-') return true
  const doc = String(documentNo || '').trim()
  if (doc && ref === doc) return true
  if (isTaxInvoiceDocumentNo(ref) && !isOutboundReceivableInvoiceNo(ref)) return true
  if (/^IVF?\d{8}-\d+$/i.test(ref) || /^IVF#\d+$/i.test(ref)) return true
  if (isAccountingPoReceivableInvoiceNo(ref)) return true
  return false
}

/**
 * Tax Invoice Reference 우선순위:
 * 1) 사용자가 저장한 값(시스템 번호가 아닌 경우)
 * 2) 원본 문서번호(회계 PO의 po_no, 강제출고 ERP reference_no)
 * 3) 저장된 값 / 미수 원장 번호
 */
export function resolveTaxInvoiceSourceReferenceNo(params: {
  savedReferenceNo?: string | null
  businessDocumentNo?: string | null
  ledgerInvoiceNo?: string | null
  documentNo?: string | null
}): string {
  const saved = String(params.savedReferenceNo || '').trim()
  const biz = String(params.businessDocumentNo || '').trim()
  const ledger = String(params.ledgerInvoiceNo || '').trim()
  const doc = params.documentNo
  if (saved && !isUnsuitableTaxInvoiceReferenceNo(saved, doc)) return saved
  if (biz && biz !== '-') return biz
  if (saved && saved !== '-') return saved
  if (ledger && ledger !== '-') return ledger
  return ''
}

/** 메모·표시문자에서 발주 Invoice 번호(PO-YYYYMMDD-xxxx) 추출 */
export function extractPurchaseOrderNoFromText(text: string | undefined | null): string {
  const m = String(text || '').match(/PO-\d{8}-\d+/i)
  return m ? m[0] : ''
}

/**
 * Tax Invoice 인쇄의 Reference 표기 정규화.
 * - 기존 출고번호(IVYYYYMMDD-1234)는 유지
 * - Tax Invoice 형식(IV.YYYYMMDD-001)이 들어오면 현재 문서번호로 동기화
 */
export function normalizeTaxInvoiceReferenceNo(
  referenceNo: string | undefined | null,
  documentNo: string | undefined | null
): string {
  const doc = String(documentNo || '').trim()
  const ref = String(referenceNo || '').trim()
  if (!ref) return doc
  if (isTaxInvoiceDocumentNo(ref) && !isOutboundReceivableInvoiceNo(ref)) return doc
  return ref
}

/** 기존 문서번호에서 순번(마지막 3자리) 추출 — 인쇄 화면 수정 시 보존용 */
export function parseTaxInvoiceDocNoSuffix(documentNo: string | undefined | null): number | null {
  const m = String(documentNo || '').match(RE_TAX_INVOICE_DOC_SUFFIX)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}
