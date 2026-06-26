/**
 * 입고 내역 — Excel(.xls HTML)보내기용 마크업 (단일·일괄)
 */

import type { InboundPrintBatchInput } from "@/lib/inbound-print-html"
import { formatInboundBangkokDate } from "@/lib/inbound-print-html"

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
table.xl td.num, table.xl th.num { text-align: right; mso-number-format: "\\#\\,\\#\\#0\\.000\\ "; }
table.xl td.num-int, table.xl th.num-int { text-align: right; mso-number-format: "0"; }
.xl-band { background: #0f2744; color: #ffffff; font-size: 15pt; font-weight: 700; padding: 10px 14px; border-color: #0f2744; letter-spacing: -0.02em; }
.xl-band-sub { background: #e2e8f0; color: #1e293b; font-size: 10pt; font-weight: 600; padding: 8px 14px; border-color: #cbd5e1; }
.xl-spacer { border: none !important; height: 10px; padding: 0 !important; background: transparent !important; }
.xl-meta-k { background: #f1f5f9; font-weight: 600; color: #475569; width: 140px; border-color: #cbd5e1; font-size: 10pt; }
.xl-meta-v { background: #ffffff; color: #0f172a; border-color: #cbd5e1; font-size: 10pt; }
.xl-thead th { background: #1e293b; color: #ffffff; font-weight: 700; font-size: 10pt; border-color: #334155; }
.xl-body td { border-color: #e2e8f0; font-size: 10pt; }
.xl-body tr:nth-child(even) td { background: #fafbfc; }
.xl-tfoot td { background: #f1f5f9; font-weight: 700; border-top: 2px solid #0f2744 !important; border-color: #94a3b8; font-size: 10pt; }
.xl-tfoot-lbl { text-align: right; color: #334155; }
.xl-section { background: #ffffff; font-size: 11pt; font-weight: 700; color: #0f2744; padding: 10px 12px; border-left: 4px solid #0f2744; border-bottom: 1px solid #cbd5e1; }
.xl-foot { font-size: 9pt; color: #64748b; padding: 10px 4px 4px 4px; border: none !important; }
`
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
<style>${excelCss()}</style>
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
