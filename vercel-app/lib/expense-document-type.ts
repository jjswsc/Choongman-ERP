/** Expense Register 첨부 문서 유형 — 비용 증빙. PP.30 매입은 세금계산서 등록함 */

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
 * 지출 첨부는 더 이상 PP.30 매입 VAT를 만들지 않는다.
 * ภาษีซื้อ는 세무 → ใบกำกับภาษีซื้อ 등록함(+입고 배치)만 반영.
 */
export function expenseDocumentQualifiesForPp30(_opts?: {
  documentType?: ExpenseDocumentType | null | ''
  invoiceReceived?: boolean | null
}): boolean {
  return false
}

export function parseExpenseDocumentTypeInput(raw: unknown): ExpenseDocumentType | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === '') return null
  return normalizeExpenseDocumentType(raw)
}
