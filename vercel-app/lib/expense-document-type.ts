/** Expense Register 첨부 문서 유형 — PP.30 매입 VAT는 Tax Invoice만 */

export const EXPENSE_DOCUMENT_TYPES = ['invoice', 'tax_invoice', 'receipt'] as const

export type ExpenseDocumentType = (typeof EXPENSE_DOCUMENT_TYPES)[number]

export function normalizeExpenseDocumentType(raw: unknown): ExpenseDocumentType | null {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (v === 'invoice' || v === 'tax_invoice' || v === 'receipt') return v
  if (v === 'taxinvoice') return 'tax_invoice'
  return null
}

/** Tax Invoice 선택 시에만 세금계산서 수령(invoice_received)으로 본다 */
export function invoiceReceivedFromDocumentType(type: ExpenseDocumentType | null | ''): boolean {
  return type === 'tax_invoice'
}

/** 레거시 체크박스/URL → 문서유형 (수령=Tax Invoice, 미수령=미선택) */
export function documentTypeFromInvoiceReceived(received: boolean): ExpenseDocumentType | null {
  return received ? 'tax_invoice' : null
}

/**
 * Tax Filing P.P.30 매입 VAT 원장 반영 대상.
 * - tax_invoice → 반영
 * - invoice / receipt → 반영하지 않음
 * - 미설정(과거 데이터) → invoice_received=true 만 (세금계산서 수령으로 표시된 건)
 */
export function expenseDocumentQualifiesForPp30(opts: {
  documentType?: ExpenseDocumentType | null | ''
  invoiceReceived?: boolean | null
}): boolean {
  const dt = normalizeExpenseDocumentType(opts.documentType)
  if (dt === 'tax_invoice') return true
  if (dt === 'invoice' || dt === 'receipt') return false
  return Boolean(opts.invoiceReceived)
}

export function parseExpenseDocumentTypeInput(raw: unknown): ExpenseDocumentType | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === '') return null
  return normalizeExpenseDocumentType(raw)
}
