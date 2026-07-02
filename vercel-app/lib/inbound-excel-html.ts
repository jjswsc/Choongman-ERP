/**
 * 입고 내역 — Excel(.xls HTML)보내기용 마크업 (단일·일괄)
 */

import type { InboundPrintBatchInput } from "@/lib/inbound-print-html"
import { formatInboundBangkokDate } from "@/lib/inbound-print-html"
import { erpExcelRichTableCss } from "@/lib/erp-excel-export"

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

function td(text: string | number, className: string, colspan = 1, align?: "right"): string {
  const al = align === "right" ? ' style="text-align:right"' : ""
  const cs = colspan > 1 ? ` colspan="${colspan}"` : ""
  const cls = className ? ` class="${className}"` : ""
  return `<td${cs}${cls}${al}>${escapeCell(text)}</td>`
}

function th(text: string, className: string, colspan = 1): string {
  const cs = colspan > 1 ? ` colspan="${colspan}"` : ""
  const cls = className ? ` class="${className}"` : ""
  return `<th${cs}${cls}>${escapeCell(text)}</th>`
}

function renderMetaRows(batch: InboundPrintBatchInput, locale: string, t: (k: string) => string): string {
  const rows: { k: string; v: string }[] = [
    { k: t("inVendor"), v: batch.vendor || "—" },
    { k: t("inInboundDate"), v: formatInboundBangkokDate(batch.date, locale) },
  ]
  if (batch.poDate) {
    rows.push({ k: t("inPoDate"), v: formatInboundBangkokDate(batch.poDate, locale) })
  }
  if (batch.poNo) rows.push({ k: t("inPoNo") || "PO", v: batch.poNo })
  if (batch.invoiceNo) rows.push({ k: t("inInvoiceNo") || "Invoice", v: batch.invoiceNo })
  return rows
    .map(
      (r) =>
        `<tr><td class="xl-meta-k" colspan="2">${escapeCell(r.k)}</td><td class="xl-meta-v" colspan="5">${escapeCell(r.v)}</td></tr>`
    )
    .join("")
}

function renderLinesTable(
  batch: InboundPrintBatchInput,
  supplyLabel: string,
  vatLabel: string,
  totalLabel: string,
  t: (k: string) => string
): string {
  const head = `<thead class="xl-thead"><tr>
${th("No", "num-int", 1)}
${th(t("outColItem"), "", 1)}
${th(t("spec"), "", 1)}
${th(t("outColQty"), "num-int", 1)}
${th(supplyLabel, "num", 1)}
${th(vatLabel, "num", 1)}
${th(totalLabel, "num", 1)}
</tr></thead>`
  const bodyRows = batch.items
    .map(
      (it, i) =>
        `<tr class="xl-body">
${td(i + 1, "num-int")}
${td(it.name || "—", "")}
${td(it.spec || "—", "")}
${td(it.qty, "num-int", 1, "right")}
${td(it.amount, "num", 1, "right")}
${td(it.vatAmount, "num", 1, "right")}
${td(it.amount + it.vatAmount, "num", 1, "right")}
</tr>`
    )
    .join("")
  const foot = `<tfoot><tr class="xl-tfoot">
<td colspan="3" class="xl-tfoot-lbl">${escapeCell(totalLabel)}</td>
${td(batch.totalQty, "num-int", 1, "right")}
${td(batch.totalAmt, "num", 1, "right")}
${td(batch.totalVat, "num", 1, "right")}
${td(batch.totalAmt + batch.totalVat, "num", 1, "right")}
</tr></tfoot>`
  return `<table class="xl" role="table">${head}<tbody class="xl-body">${bodyRows}</tbody>${foot}</table>`
}

export type InboundExcelExportOptions = {
  locale: string
  t: (k: string) => string
  supplyLabel: string
  vatLabel: string
  totalLabel: string
  generatedAt: Date
  /** 조회 기간 표기 (예: 20240101-20240131) */
  periodLabel: string
  /** 매장/범위 문구 */
  storeContext: string
}

/** Excel 시트 이름: XML 1.0 + 길이 제한 (HTML 엔티티 없음) */
function excelSheetName(raw: string): string {
  const s = String(raw || "Sheet1")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F&<>"']/g, "")
    .replace(/[[\]*?:/\\]/g, "-")
    .trim()
  return (s || "Sheet1").slice(0, 31)
}

function xmlEscapeText(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
}

function excelShell(innerTables: string, title: string): string {
  const sheet = xmlEscapeText(excelSheetName(title))
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/>
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${sheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>${erpExcelRichTableCss()}</style>
</head><body>${innerTables}</body></html>`
}

export function buildInboundExcelHtmlSingle(
  batch: InboundPrintBatchInput,
  opts: InboundExcelExportOptions
): string {
  const { locale, t, supplyLabel, vatLabel, totalLabel, generatedAt, periodLabel, storeContext } = opts
  const sub = `${escapeCell(t("inPrintDocSubtitle"))} · ${escapeCell(t("adminInbound"))}`
  const ref = escapeCell(formatInboundBangkokDate(batch.date, locale))
  const meta = renderMetaRows(batch, locale, t)
  const lines = renderLinesTable(batch, supplyLabel, vatLabel, totalLabel, t)
  const footL = escapeCell(t("inPrintFooterLeft"))
  const footR = escapeCell(t("inExcelExportedAt").replace("{datetime}", excelGeneratedAt(generatedAt, locale)))
  const period = escapeCell(periodLabel)
  const store = escapeCell(storeContext)

  const block = `<table class="xl" role="table">
<tr><td class="xl-band" colspan="7">${escapeCell(t("adminInbound"))}</td></tr>
<tr><td class="xl-band-sub" colspan="7">${sub}</td></tr>
<tr><td class="xl-spacer" colspan="7"></td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("inPrintRefLabel"))}</td><td class="xl-meta-v" colspan="5">${ref}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("inExcelPeriodLabel"))}</td><td class="xl-meta-v" colspan="5">${period}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("inExcelStoreLabel"))}</td><td class="xl-meta-v" colspan="5">${store}</td></tr>
<tr><td class="xl-spacer" colspan="7"></td></tr>
${meta}
<tr><td class="xl-spacer" colspan="7"></td></tr>
</table>
${lines}
<table class="xl" role="table"><tr><td class="xl-foot" colspan="7">${footL} &nbsp;|&nbsp; ${footR}</td></tr></table>`

  return excelShell(block, t("adminInbound"))
}

export function buildInboundExcelHtmlBulk(batches: InboundPrintBatchInput[], opts: InboundExcelExportOptions): string {
  const { locale, t, supplyLabel, vatLabel, totalLabel, generatedAt, periodLabel, storeContext } = opts
  const sub = `${escapeCell(t("inPrintDocSubtitle"))} · ${escapeCell(t("adminInbound"))}`
  const footL = escapeCell(t("inPrintFooterLeft"))
  const footR = escapeCell(t("inExcelExportedAt").replace("{datetime}", excelGeneratedAt(generatedAt, locale)))
  const period = escapeCell(periodLabel)
  const store = escapeCell(storeContext)
  const cover = `<table class="xl" role="table">
<tr><td class="xl-band" colspan="7">${escapeCell(t("adminInbound"))}</td></tr>
<tr><td class="xl-band-sub" colspan="7">${sub}</td></tr>
<tr><td class="xl-spacer" colspan="7"></td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("inPrintBulkRefLabel"))}</td><td class="xl-meta-v" colspan="5">${escapeCell(String(batches.length))}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("inExcelPeriodLabel"))}</td><td class="xl-meta-v" colspan="5">${period}</td></tr>
<tr><td class="xl-meta-k" colspan="2">${escapeCell(t("inExcelStoreLabel"))}</td><td class="xl-meta-v" colspan="5">${store}</td></tr>
<tr><td class="xl-spacer" colspan="7"></td></tr>
</table>`

  const parts = batches.map((batch, idx) => {
    const sectionTitle = `${idx + 1}. ${batch.vendor || "—"} · ${formatInboundBangkokDate(batch.date, locale)}`
    const meta = renderMetaRows(batch, locale, t)
    const lines = renderLinesTable(batch, supplyLabel, vatLabel, totalLabel, t)
    const sep =
      idx > 0
        ? `<table class="xl" role="table"><tr><td class="xl-spacer" colspan="7" style="height:16px"></td></tr></table>`
        : ""
    return `${sep}<table class="xl" role="table"><tr><td class="xl-section" colspan="7">${escapeCell(sectionTitle)}</td></tr></table>
<table class="xl" role="table">${meta}<tr><td class="xl-spacer" colspan="7"></td></tr></table>
${lines}`
  })

  const footer = `<table class="xl" role="table"><tr><td class="xl-foot" colspan="7">${footL} &nbsp;|&nbsp; ${footR}</td></tr></table>`
  return excelShell(`${cover}${parts.join("")}${footer}`, `${t("adminInbound")}_bulk`)
}
