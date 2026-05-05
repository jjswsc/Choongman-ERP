/**
 * Tax Invoice(InvoiceData) 동일 금액·거래처 반영 — Excel(.xls HTML) 다운로드용.
 * 화면 `/admin/invoice-print` 와 같은 데이터를 표 형태로 저장한다.
 */

import type { InvoiceData } from "@/components/invoice"

const BANGKOK_TZ = "Asia/Bangkok"

function escapeCell(v: string | number): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v)
    return String(v)
  }
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function excelGeneratedAt(d: Date, locale: string): string {
  return d.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BANGKOK_TZ,
  })
}

function excelCss(): string {
  return `
table.xl { border-collapse: collapse; width: 100%; font-family: Calibri, "Malgun Gothic", "Noto Sans KR", "Noto Sans Thai", Arial, sans-serif; font-size: 11pt; color: #0f172a; }
table.xl td, table.xl th { border: 1px solid #94a3b8; padding: 6px 10px; vertical-align: middle; }
table.xl td.num, table.xl th.num { text-align: right; mso-number-format: "\\#\\,\\#\\#0\\.00\\ "; }
table.xl td.num-int, table.xl th.num-int { text-align: right; mso-number-format: "0"; }
.xl-band { background: #0f2744; color: #ffffff; font-size: 15pt; font-weight: 700; padding: 10px 14px; border-color: #0f2744; }
.xl-band-sub { background: #e2e8f0; color: #1e293b; font-size: 10pt; font-weight: 600; padding: 8px 14px; }
.xl-meta-k { background: #f1f5f9; font-weight: 600; color: #475569; width: 140px; font-size: 10pt; }
.xl-meta-v { background: #ffffff; color: #0f172a; font-size: 10pt; }
.xl-thead th { background: #1e293b; color: #ffffff; font-weight: 700; font-size: 10pt; border-color: #334155; }
.xl-body td { border-color: #e2e8f0; font-size: 10pt; }
.xl-tfoot td { background: #f1f5f9; font-weight: 700; border-top: 2px solid #0f2744 !important; font-size: 10pt; }
.xl-foot { font-size: 9pt; color: #64748b; padding: 10px 4px 4px 4px; border: none !important; }
`
}

function xmlEscapeText(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
}

function excelSheetName(raw: string): string {
  const s = String(raw || "Sheet1")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F&<>"']/g, "")
    .replace(/[[\]*?:/\\]/g, "-")
    .trim()
  return (s || "Sheet1").slice(0, 31)
}

function excelShell(innerTables: string, title: string): string {
  const sheet = xmlEscapeText(excelSheetName(title))
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/>
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${sheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>${excelCss()}</style>
</head><body>${innerTables}</body></html>`
}

export function buildTaxInvoiceExcelHtmlFromInvoiceData(
  data: InvoiceData,
  opts: {
    locale: string
    t: (k: string) => string
    generatedAt: Date
    periodLabel: string
    storeContext: string
  }
): string {
  const { locale, t, generatedAt, periodLabel, storeContext } = opts
  const footR = escapeCell(
    t("inExcelExportedAt").replace("{datetime}", excelGeneratedAt(generatedAt, locale))
  )
  const nf = (n: number) => escapeCell(n.toLocaleString(locale))

  const headBlock = `<table class="xl" role="table">
<tr><td class="xl-band" colspan="7">${escapeCell(data.documentType)} — ${escapeCell(data.documentNo)}</td></tr>
<tr><td class="xl-band-sub" colspan="7">${escapeCell(data.seller.name)} → ${escapeCell(data.client.name)}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("inInboundDate"))}</td><td class="xl-meta-v" colspan="5">${escapeCell(data.issueDate)}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("inExcelPeriodLabel"))}</td><td class="xl-meta-v" colspan="5">${escapeCell(periodLabel)}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("inExcelStoreLabel"))}</td><td class="xl-meta-v" colspan="5">${escapeCell(storeContext)}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("settings_company_name"))} (${t("posTaxIdLabel")})</td><td class="xl-meta-v" colspan="5">${escapeCell(data.seller.taxId)}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("settings_address"))}</td><td class="xl-meta-v" colspan="5">${escapeCell(data.seller.address)}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("purchaseOrderVendor"))} / ${escapeCell(t("store"))}</td><td class="xl-meta-v" colspan="5">${escapeCell(data.client.name)}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("posTaxIdLabel"))}</td><td class="xl-meta-v" colspan="5">${escapeCell(data.client.taxId)}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("poInvoiceNo"))}</td><td class="xl-meta-v" colspan="5">${escapeCell(data.referenceNo)}</td></tr>
</table>`

  const lineHead = `<thead class="xl-thead"><tr>
<th class="num-int">#</th>
<th>${escapeCell(t("outColItem"))}</th>
<th class="num-int">${escapeCell(t("outColQty"))}</th>
<th class="num">${escapeCell(t("inColCost"))}</th>
<th class="num">${escapeCell(t("salesSupplyAmount") || "Amount")}</th>
</tr></thead>`

  const lineBody = data.items
    .map(
      (it, i) =>
        `<tr class="xl-body">
<td class="num-int">${escapeCell(i + 1)}</td>
<td>${escapeCell(it.description)}</td>
<td class="num-int">${nf(it.quantity)}</td>
<td class="num">${nf(it.unitPrice)}</td>
<td class="num">${nf(it.amount)}</td>
</tr>`
    )
    .join("")

  const foot = `<tfoot><tr class="xl-tfoot">
<td colspan="4" style="text-align:right">${escapeCell(t("posSubtotal"))}</td>
<td class="num">${nf(data.subtotal)}</td>
</tr>
<tr class="xl-tfoot">
<td colspan="4" style="text-align:right">${escapeCell(`${t("posVatLabel")} ${data.vatRate}%`)}</td>
<td class="num">${nf(data.vatAmount)}</td>
</tr>
<tr class="xl-tfoot">
<td colspan="4" style="text-align:right">${escapeCell(t("inv_total"))}</td>
<td class="num">${nf(data.grandTotal)}</td>
</tr></tfoot>`

  const linesTable = `<table class="xl" role="table">${lineHead}<tbody class="xl-body">${lineBody}</tbody>${foot}</table>`
  const footer = `<table class="xl" role="table"><tr><td class="xl-foot" colspan="7">${escapeCell(
    t("inPrintFooterLeft")
  )} &nbsp;|&nbsp; ${footR}</td></tr></table>`

  return excelShell(`${headBlock}${linesTable}${footer}`, data.documentType || "Tax Invoice")
}
