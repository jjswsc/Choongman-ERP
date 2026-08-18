import { describe, expect, it } from "vitest"
import {
  SALES_OUTBOUND_INVOICE_TITLE,
  SALES_RECEIPT_TITLE,
  SALES_TAX_INVOICE_TITLE,
  isReceivableAccrualCollected,
  isSalesTaxInvoicePrintDoc,
  salesTaxPrintDocumentType,
} from "./sales-tax-document-title"

describe("isReceivableAccrualCollected", () => {
  it("treats receive_checked as collected", () => {
    expect(isReceivableAccrualCollected({ id: 1, receive_checked: true })).toBe(true)
  })

  it("treats bank_transaction_id on the accrual as collected", () => {
    expect(isReceivableAccrualCollected({ id: 1, bank_transaction_id: 99 })).toBe(true)
  })

  it("treats a bank-linked Receive sibling as collected", () => {
    expect(
      isReceivableAccrualCollected({ id: 10, receive_checked: false }, [
        { id: 20, ref_type: "Receive", ref_id: 10, bank_transaction_id: 88 },
      ])
    ).toBe(true)
  })

  it("does not treat unpaid accrual as collected", () => {
    expect(
      isReceivableAccrualCollected({ id: 10, receive_checked: false }, [
        { id: 21, ref_type: "Receive", ref_id: 99, bank_transaction_id: 1 },
      ])
    ).toBe(false)
  })
})

describe("salesTaxPrintDocumentType", () => {
  it("uses Receipt after collection and Tax Invoice/Receipt while unpaid", () => {
    expect(salesTaxPrintDocumentType(true)).toBe(SALES_RECEIPT_TITLE)
    expect(salesTaxPrintDocumentType(false)).toBe(SALES_TAX_INVOICE_TITLE)
  })
})

describe("isSalesTaxInvoicePrintDoc", () => {
  it("treats Receipt title as tax print when docKind is missing", () => {
    expect(isSalesTaxInvoicePrintDoc({ documentType: "Receipt" })).toBe(true)
    expect(isSalesTaxInvoicePrintDoc({ documentType: "Tax Invoice/Receipt" })).toBe(true)
  })

  it("does not treat outbound Invoice/Tax invoice as tax print", () => {
    expect(isSalesTaxInvoicePrintDoc({ documentType: "Invoice" })).toBe(false)
    expect(isSalesTaxInvoicePrintDoc({ documentType: SALES_OUTBOUND_INVOICE_TITLE })).toBe(false)
    expect(isSalesTaxInvoicePrintDoc({ docKind: "invoice", documentType: SALES_OUTBOUND_INVOICE_TITLE })).toBe(false)
    expect(isSalesTaxInvoicePrintDoc({ docKind: "invoice", documentType: "Receipt" })).toBe(false)
    expect(isSalesTaxInvoicePrintDoc({ docKind: "tax", documentType: "Receipt" })).toBe(true)
  })
})
