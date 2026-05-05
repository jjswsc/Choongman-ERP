/**
 * 입고 내역 브라우저 인쇄용 HTML (단일·일괄 공통 스타일)
 */

const BANGKOK_TZ = "Asia/Bangkok"

export type InboundPrintLineItem = {
  name: string
  spec: string
  qty: number
  amount: number
  vatAmount: number
}

export type InboundPrintBatchInput = {
  date: string
  poDate?: string | null
  vendor: string
  poNo?: string
  invoiceNo?: string
  items: InboundPrintLineItem[]
  totalQty: number
  totalAmt: number
  totalVat: number
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** 방콕 기준 표시용 날짜 문자열(HTML/엑셀 공통, 이스케이프 없음) */
export function formatInboundBangkokDate(iso: string, locale: string): string {
  if (!iso) return "—"
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00+07:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(locale, { dateStyle: "medium", timeZone: BANGKOK_TZ })
}

function formatDate(iso: string, locale: string): string {
  return escapeHtml(formatInboundBangkokDate(iso, locale))
}

function inboundPrintCss(): string {
  return `
:root {
  --ink: #0f172a;
  --muted: #64748b;
  --line: #e2e8f0;
  --band: #0f2744;
  --thead: #1e293b;
  --zebra: #f8fafc;
  --foot-bg: #f1f5f9;
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", "Noto Sans Thai", "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ink);
  background: #fff;
}
.sheet {
  max-width: 210mm;
  margin: 0 auto;
  padding: 20px 28px 36px;
}
.doc-top {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.doc-band {
  flex: 1;
  background: linear-gradient(135deg, var(--band) 0%, #1a365d 100%);
  color: #fff;
  padding: 14px 18px;
  border-radius: 2px;
  min-height: 72px;
}
.doc-band-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.88;
  margin-bottom: 6px;
}
.doc-band-main {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.2;
}
.doc-band-sub {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.92;
}
.doc-ref {
  flex-shrink: 0;
  width: 148px;
  border: 1px solid var(--line);
  border-radius: 2px;
  padding: 12px 14px;
  text-align: right;
  background: #fafbfc;
}
.doc-ref-label {
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.doc-ref-value {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.meta {
  display: grid;
  grid-template-columns: minmax(100px, 120px) 1fr minmax(100px, 120px) 1fr;
  gap: 8px 20px;
  margin-bottom: 22px;
  padding: 14px 16px;
  background: var(--zebra);
  border: 1px solid var(--line);
  border-radius: 2px;
  font-size: 12px;
}
.meta-k {
  color: var(--muted);
  font-weight: 600;
  text-align: right;
  padding-top: 2px;
}
.meta-v {
  border-bottom: 1px solid var(--line);
  padding-bottom: 3px;
  font-weight: 500;
}
table.lines {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}
table.lines thead th {
  background: var(--thead);
  color: #fff;
  font-weight: 600;
  padding: 10px 8px;
  text-align: left;
  border: 1px solid #334155;
}
table.lines thead th.num { text-align: right; }
table.lines tbody td {
  padding: 8px 8px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
table.lines tbody tr:nth-child(even) td { background: #fcfcfd; }
table.lines tbody td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
table.lines tfoot td {
  font-weight: 700;
  padding: 11px 8px;
  border-top: 2px solid var(--band);
  background: var(--foot-bg);
  font-variant-numeric: tabular-nums;
}
table.lines tfoot td.num { text-align: right; }
table.lines tfoot td.lbl { text-align: right; color: var(--muted); font-weight: 600; }
.section-gap {
  margin-top: 28px;
  padding-top: 22px;
  border-top: 1px dashed var(--line);
}
.batch-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--band);
  letter-spacing: -0.01em;
}
.doc-footer {
  margin-top: 28px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  font-size: 10px;
  color: var(--muted);
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
@media print {
  body { background: #fff; }
  .sheet { padding: 12mm 14mm; max-width: none; }
  .section-gap { page-break-inside: avoid; }
  table.lines { page-break-inside: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
}
`
}

function renderMetaGrid(
  batch: InboundPrintBatchInput,
  locale: string,
  t: (k: string) => string
): string {
  const cells: { k: string; v: string }[] = [
    { k: t("inVendor"), v: batch.vendor || "—" },
    { k: t("inInboundDate"), v: formatDate(batch.date, locale) },
  ]
  if (batch.poDate) {
    cells.push({ k: t("inPoDate"), v: formatDate(batch.poDate, locale) })
  }
  if (batch.poNo) {
    cells.push({ k: t("inPoNo") || "PO", v: batch.poNo })
  }
  if (batch.invoiceNo) {
    cells.push({ k: t("inInvoiceNo") || "Invoice", v: batch.invoiceNo })
  }
  if (cells.length % 2 !== 0) {
    cells.push({ k: "\u00a0", v: "\u00a0" })
  }
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += 2) {
    const a = cells[i]
    const b = cells[i + 1]
    rows.push(
      `<div class="meta-k">${escapeHtml(a.k)}</div><div class="meta-v">${escapeHtml(a.v)}</div>` +
        `<div class="meta-k">${escapeHtml(b.k)}</div><div class="meta-v">${escapeHtml(b.v)}</div>`
    )
  }
  return `<div class="meta">${rows.join("")}</div>`
}

function renderLinesTable(
  batch: InboundPrintBatchInput,
  locale: string,
  supplyLabel: string,
  vatLabel: string,
  totalLabel: string,
  t: (k: string) => string
): string {
  const nf = (n: number) => escapeHtml(n.toLocaleString(locale))
  const rows = batch.items
    .map(
      (it, i) =>
        `<tr>
  <td class="num">${i + 1}</td>
  <td>${escapeHtml(it.name || "—")}</td>
  <td>${escapeHtml(it.spec || "—")}</td>
  <td class="num">${nf(it.qty)}</td>
  <td class="num">${nf(it.amount)}</td>
  <td class="num">${nf(it.vatAmount)}</td>
  <td class="num">${nf(it.amount + it.vatAmount)}</td>
</tr>`
    )
    .join("")
  return `<table class="lines" role="table">
<thead>
<tr>
  <th class="num" style="width:36px">No</th>
  <th>${escapeHtml(t("outColItem"))}</th>
  <th style="width:22%">${escapeHtml(t("spec"))}</th>
  <th class="num" style="width:11%">${escapeHtml(t("outColQty"))}</th>
  <th class="num" style="width:13%">${escapeHtml(supplyLabel)}</th>
  <th class="num" style="width:11%">${escapeHtml(vatLabel)}</th>
  <th class="num" style="width:13%">${escapeHtml(totalLabel)}</th>
</tr>
</thead>
<tbody>${rows}</tbody>
<tfoot>
<tr>
  <td colspan="3" class="lbl">${escapeHtml(totalLabel)}</td>
  <td class="num">${nf(batch.totalQty)}</td>
  <td class="num">${nf(batch.totalAmt)}</td>
  <td class="num">${nf(batch.totalVat)}</td>
  <td class="num">${nf(batch.totalAmt + batch.totalVat)}</td>
</tr>
</tfoot>
</table>`
}

function renderBatchBlock(
  batch: InboundPrintBatchInput,
  options: {
    locale: string
    t: (k: string) => string
    supplyLabel: string
    vatLabel: string
    totalLabel: string
    sectionClass?: string
    showBatchTitle?: boolean
  }
): string {
  const { locale, t, supplyLabel, vatLabel, totalLabel, sectionClass = "", showBatchTitle } = options
  const title =
    showBatchTitle === true
      ? `<div class="batch-title">${escapeHtml(batch.vendor || "—")} · ${formatDate(batch.date, locale)}</div>`
      : ""
  const cls = sectionClass ? ` class="${sectionClass}"` : ""
  return `<section${cls}>
${title}
${renderMetaGrid(batch, locale, t)}
${renderLinesTable(batch, locale, supplyLabel, vatLabel, totalLabel, t)}
</section>`
}

function renderFooter(t: (k: string) => string, printedAt: Date, locale: string): string {
  const dt = escapeHtml(
    printedAt.toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: BANGKOK_TZ,
    })
  )
  const left = escapeHtml(t("inPrintFooterLeft"))
  const at = escapeHtml(t("inPrintFooterAt")).replace("{datetime}", dt)
  return `<footer class="doc-footer"><span>${left}</span><span>${at}</span></footer>`
}

export function buildInboundPrintHtmlSingle(
  batch: InboundPrintBatchInput,
  options: {
    locale: string
    lang: string
    t: (k: string) => string
    supplyLabel: string
    vatLabel: string
    totalLabel: string
    printedAt?: Date
  }
): string {
  const { locale, lang, t, supplyLabel, vatLabel, totalLabel } = options
  const printedAt = options.printedAt ?? new Date()
  const docTitle = escapeHtml(`${t("adminInbound")} — ${batch.date}`)
  const refLabel = escapeHtml(t("inPrintRefLabel"))
  const refVal = escapeHtml(batch.date)

  const body = `
<div class="sheet">
  <div class="doc-top">
    <div class="doc-band">
      <div class="doc-band-title">${escapeHtml(t("inPrintDocSubtitle"))}</div>
      <div class="doc-band-main">${escapeHtml(t("adminInbound"))}</div>
      <div class="doc-band-sub">${escapeHtml(t("inVendor"))}: ${escapeHtml(batch.vendor || "—")}</div>
    </div>
    <div class="doc-ref">
      <div class="doc-ref-label">${refLabel}</div>
      <div class="doc-ref-value">${refVal}</div>
    </div>
  </div>
  ${renderBatchBlock(batch, { locale, t, supplyLabel, vatLabel, totalLabel, sectionClass: "" })}
  ${renderFooter(t, printedAt, locale)}
</div>`

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${docTitle}</title>
<style>${inboundPrintCss()}</style>
</head>
<body>${body}</body>
</html>`
}

export function buildInboundPrintHtmlBulk(
  batches: InboundPrintBatchInput[],
  options: {
    locale: string
    lang: string
    t: (k: string) => string
    supplyLabel: string
    vatLabel: string
    totalLabel: string
    printedAt?: Date
  }
): string {
  const { locale, lang, t, supplyLabel, vatLabel, totalLabel } = options
  const printedAt = options.printedAt ?? new Date()
  const docTitle = escapeHtml(`${t("adminInbound")} (${batches.length})`)

  const sections = batches
    .map((batch, idx) =>
      renderBatchBlock(batch, {
        locale,
        t,
        supplyLabel,
        vatLabel,
        totalLabel,
        sectionClass: idx === 0 ? "" : "section-gap",
        showBatchTitle: true,
      })
    )
    .join("")

  const body = `
<div class="sheet">
  <div class="doc-top">
    <div class="doc-band">
      <div class="doc-band-title">${escapeHtml(t("inPrintDocSubtitle"))}</div>
      <div class="doc-band-main">${escapeHtml(t("adminInbound"))}</div>
    </div>
    <div class="doc-ref">
      <div class="doc-ref-label">${escapeHtml(t("inPrintBulkRefLabel"))}</div>
      <div class="doc-ref-value">${escapeHtml(String(batches.length))}</div>
    </div>
  </div>
  ${sections}
  ${renderFooter(t, printedAt, locale)}
</div>`

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${docTitle}</title>
<style>${inboundPrintCss()}</style>
</head>
<body>${body}</body>
</html>`
}
