import type { InvoiceData } from "@/components/invoice"
import type { InvoiceDataClient, InvoiceDataCompany } from "@/lib/api-client"
import type { OrderInvoiceTotals } from "@/lib/api-client"
import { thaiInvoiceTotalsFromRawSubtotal } from "@/lib/invoice-vat-total"

export type ThaiSalesInvoiceLineInput = {
  code?: string
  name?: string
  spec?: string
  /** 품목명 아래 표시(여러 줄은 \\n) */
  lineRemarks?: string
  qty: number
  amount: number
}

/**
 * 태국 7% VAT 인보이스 HTML용 데이터 (출고 인쇄·미수금 Tax Invoice 공통).
 * documentType은 인쇄물 제목(영문 "Invoice" / "Tax Invoice/Receipt" 등)으로 넘긴다.
 */
export function buildThaiSalesInvoiceData(params: {
  documentType: string
  documentNo: string
  issueDate: string
  dueDate?: string
  referenceNo?: string
  paymentTerms?: string
  shippingMethod?: string
  company: InvoiceDataCompany | null
  client: InvoiceDataClient | { companyName: string }
  invSettings: Record<string, string>
  lines: ThaiSalesInvoiceLineInput[]
  /** 없으면 lines 공급가 합계로 VAT 계산 */
  orderInvoiceTotals?: OrderInvoiceTotals
  /** 인쇄 편집값 영구 저장용 source 식별자 */
  sourceRefType?: string
  sourceRefId?: number
}): InvoiceData {
  const { documentType, documentNo, issueDate, company, client, invSettings, lines } = params
  const dueDate = params.dueDate ?? issueDate
  const referenceNo = params.referenceNo ?? documentNo
  const rawSum = lines.reduce((s, it) => s + Number(it.amount || 0), 0)
  const totals =
    params.orderInvoiceTotals ??
    (lines.length > 0 ? thaiInvoiceTotalsFromRawSubtotal(rawSum) : { subtotalRounded: 0, vatRounded: 0, grandTotal: 0 })

  const termsRaw = invSettings.terms_and_conditions ?? "[]"
  let termsAndConditions: string[] = []
  try {
    const arr = JSON.parse(termsRaw)
    termsAndConditions = Array.isArray(arr) ? arr.map(String) : []
  } catch {
    termsAndConditions = []
  }

  const rawCompanyName = company?.companyName || "S&J Global Co., Ltd"
  const companyName = rawCompanyName.replace(/\.\.ltd\b/gi, "Ltd.").replace(/\.ltd\b/gi, "Ltd.")
  const stampBase = typeof window !== "undefined" && window.location?.origin ? window.location.origin : ""
  const rawClientName = (client as { companyName?: string }).companyName || "-"
  const cleanedClientName = rawClientName.replace(/แฟรนไชส์/g, "").replace(/\s{2,}/g, " ").trim()
  const isRbFoodSupply = /r\s*&\s*b\s*food\s*supply/i.test(cleanedClientName)
  const clientTaxId = isRbFoodSupply ? "0107561000374" : ((client as InvoiceDataClient)?.taxId || "-")

  return {
    documentType,
    documentNo,
    dueDate,
    referenceNo,
    issueDate,
    shipTo: (invSettings.ship_to ?? "-") || "-",
    paymentTerms: (params.paymentTerms ?? invSettings.payment_terms) || "Net 30 Days",
    shippingMethod: (params.shippingMethod ?? invSettings.shipping_method) || "Company Delivery",
    seller: {
      name: companyName,
      address: company?.address || "-",
      taxId: company?.taxId || "-",
      phone: company?.phone || "-",
      email: invSettings.seller_email || undefined,
      website: invSettings.seller_website || undefined,
    },
    client: {
      name: cleanedClientName || "-",
      address: (client as InvoiceDataClient)?.address || "-",
      taxId: clientTaxId,
      phone: (client as InvoiceDataClient)?.phone || "-",
    },
    items: lines.map((it, idx) => {
      const amt = Math.round(Math.abs(it.amount || 0))
      const qty = Math.abs(it.qty || 0)
      const unitPrice = qty ? amt / qty : 0
      const lr = (it.lineRemarks || "").trim()
      return {
        id: idx + 1,
        itemCode: it.code,
        description: (it.name || "-") + (it.spec ? ` ${it.spec}` : ""),
        lineRemarks: lr || undefined,
        quantity: qty,
        unitPrice,
        discount: 0,
        amount: amt,
      }
    }),
    subtotal: totals.subtotalRounded,
    vatRate: 7,
    vatAmount: totals.vatRounded,
    grandTotal: totals.grandTotal,
    bankInfo: {
      bankName: invSettings.bank_name || "Kasikorn Bank (KBank)",
      accountNo: invSettings.account_no || "",
      accountName: invSettings.account_name || companyName,
      swiftCode: invSettings.swift_code || undefined,
    },
    remarks: invSettings.remarks || "Please transfer payment to the bank account shown above.",
    termsAndConditions,
    stampImageUrl: stampBase ? `${stampBase}/company-stamp.png` : "/company-stamp.png",
    sourceRefType: params.sourceRefType,
    sourceRefId: params.sourceRefId,
  }
}
