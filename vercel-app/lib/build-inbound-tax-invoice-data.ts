import type { InvoiceData } from "@/components/invoice"
import type { InvoiceDataClient, InvoiceDataCompany } from "@/lib/api-client"
import type { InboundTableRow } from "@/components/inbound"
import { buildThaiSalesInvoiceData } from "@/lib/thai-sales-invoice-data"

/**
 * 매장 입고 행 → 출고·미수금과 동일 Tax Invoice 데이터 (`/admin/invoice-print` 의 `<Invoice />`).
 * Seller: getInvoiceData().company / Client: 해당 매장 BILL TO(vendors 매출처).
 */
export function buildInboundTaxInvoiceData(params: {
  row: InboundTableRow
  company: InvoiceDataCompany | null
  client: InvoiceDataClient | { companyName: string }
  invSettings: Record<string, string>
}): InvoiceData {
  const { row, company, client, invSettings } = params
  const issueDate = (row.date || "").split(" ")[0] || new Date().toISOString().slice(0, 10)
  const invNo = String(row.invoiceNo || "").trim()
  const poNo = String(row.poNo || "").trim()
  const docNo = invNo || poNo || `INB-${issueDate.replace(/\D/g, "")}`
  const referenceNo =
    [poNo && `PO ${poNo}`, invNo && `Invoice ${invNo}`].filter(Boolean).join(" · ") || docNo

  return buildThaiSalesInvoiceData({
    documentType: "Tax Invoice",
    documentNo: docNo,
    issueDate,
    dueDate: issueDate,
    referenceNo,
    company,
    client,
    invSettings,
    lines: row.items.map((it) => ({
      name: it.name,
      spec: it.spec,
      qty: Math.abs(it.qty || 0),
      amount: Math.round(Math.abs(it.amount || 0)),
    })),
    orderInvoiceTotals: {
      subtotalRounded: Math.round(row.totalAmt),
      vatRounded: Math.round(row.totalVat),
      grandTotal: Math.round(row.totalAmt + row.totalVat),
    },
    sourceRefType: row.inboundBatchId ? "Inbound" : undefined,
    sourceRefId:
      row.inboundBatchId && row.inboundBatchId > 0 ? row.inboundBatchId : undefined,
  })
}
