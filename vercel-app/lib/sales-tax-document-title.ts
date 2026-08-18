/**
 * 미수금 Tax Invoice 인쇄 제목.
 * 미수(미수금) → Tax Invoice/Receipt, 수금 완료 → Receipt.
 * 문서번호(IV.YYYYMMDD-NNN)·override 종류(tax)는 제목과 별개로 유지한다.
 */

export const SALES_TAX_INVOICE_TITLE = "Tax Invoice/Receipt"
export const SALES_RECEIPT_TITLE = "Receipt"
/** 출고(ส่งออก) 인쇄 제목 — 미수금 Tax Invoice 순번(IV.)과 구분 */
export const SALES_OUTBOUND_INVOICE_TITLE = "Invoice/Tax invoice"

export type SalesTaxPrintRow = {
  id?: number
  receive_checked?: boolean
  bank_transaction_id?: number | null
  ref_type?: string
  ref_id?: number
}

/** 수금확인 또는 통장 미수 연결이면 수금 완료 */
export function isReceivableAccrualCollected(
  row: SalesTaxPrintRow,
  siblings: SalesTaxPrintRow[] = []
): boolean {
  if (Boolean(row.receive_checked)) return true
  if (Number(row.bank_transaction_id || 0) > 0) return true
  const accrualId = Number(row.id || 0)
  if (!(accrualId > 0)) return false
  return siblings.some(
    (s) =>
      String(s.ref_type || "") === "Receive" &&
      Number(s.ref_id || 0) === accrualId &&
      Number(s.bank_transaction_id || 0) > 0
  )
}

export function salesTaxPrintDocumentType(collected: boolean): string {
  return collected ? SALES_RECEIPT_TITLE : SALES_TAX_INVOICE_TITLE
}

/** invoice-print override·순번 예약 — 제목이 Receipt여도 tax 문서로 본다 */
export function isSalesTaxInvoicePrintDoc(data: {
  docKind?: string
  documentType?: string
}): boolean {
  const kind = String(data.docKind || "").trim().toLowerCase()
  if (kind === "tax") return true
  if (kind === "invoice") return false
  const title = String(data.documentType || "").trim()
  if (/^receipt$/i.test(title)) return true
  // "Tax Invoice" / "Tax Invoice/Receipt" only — not outbound "Invoice/Tax invoice"
  return /^tax\s*invoice/i.test(title)
}
