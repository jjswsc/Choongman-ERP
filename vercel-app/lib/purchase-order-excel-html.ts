/**
 * 회계·물류 PO Excel(.xls HTML) — A4 세로 1장 인쇄용 인보이스 양식.
 * 중첩 표는 Excel이 열 폭을 부풀려 여러 장으로 쪼개므로 쓰지 않는다.
 */

import { erpExcelRichTableCss } from "@/lib/erp-excel-export"
import { roundMoney2 } from "@/lib/invoice-vat-total"

export type PoExcelParty = {
  name: string
  address?: string
  taxId?: string
  phone?: string
  extraLines?: { label: string; value: string }[]
}

export type PoExcelLine = {
  name: string
  spec?: string
  code?: string
  price: number
  qty: number
  store?: string
}

export type PoExcelLabels = {
  docTitle: string
  docNoLabel: string
  dateLabel: string
  fromLabel: string
  billToLabel: string
  shipToLabel: string
  taxIdLabel: string
  addressLabel: string
  phoneLabel: string
  no: string
  item: string
  spec: string
  unitPrice: string
  qty: string
  amount: string
  subtotal: string
  vatLine: string
  invoiceTotal: string
  preparedBy: string
  receivedBy: string
  signatureDate: string
  authorizedStamp: string
  storeLabel: string
  headerBadge?: string
  poFormatLabel?: string
  whtLabel?: string
  netAfterWht?: string
}

export type PoExcelInput = {
  poNo: string
  dateStr: string
  from: PoExcelParty
  billTo: PoExcelParty
  shipToName: string
  shipToAddress: string
  lines: PoExcelLine[]
  subtotal: number
  vat: number
  total: number
  withholdingTaxAmount?: number
  preparedByName: string
  labels: PoExcelLabels
}

const COLS = 6
/**
 * A4 세로 인쇄 가능 폭(여백 0.4" 제외 ≈ 190mm)보다 약간 좁게.
 * Fit-to-page는 축소만 하고 확대는 안 하므로, 시트 자체를 A4 크기로 둔다.
 */
const SHEET_WIDTH_MM = 182
/** 열 폭(pt). 합 520pt ≈ 183mm. HTML width는 px(pt×96/72). */
const COL_WIDTH_PT = [40, 188, 78, 78, 52, 84] as const
const COL_WIDTH_PX = COL_WIDTH_PT.map((pt) => Math.round((pt * 96) / 72))
const SHEET_WIDTH_PX = COL_WIDTH_PX.reduce((a, b) => a + b, 0)

/** 짧은 인보이스용 빈 품목 줄 */
export const PO_EXCEL_MIN_ITEM_ROWS = 10
const ITEM_ROW_HEIGHT_PT = 22
const SIGN_BOX_HEIGHT_PT = 80
const SECTION_GAP_PT = 12
const MAX_ADDR_LINES = 5

function escapeCell(v: string | number): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function xmlEscapeText(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
}

function excelSheetName(raw: string): string {
  const s = String(raw || "Invoice")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F&<>"']/g, "")
    .replace(/[[\]*?:/\\]/g, "-")
    .trim()
  return (s || "Invoice").slice(0, 31)
}

/** 반쪽 칸(3열)에 맞게 주소를 줄바꿈. 너무 잘게 쪼개면 칸만 높고 글은 가늘게 보임. */
export function wrapAddressHtml(raw: string, maxLen = 46): { html: string; heightPt: number } {
  const s = String(raw || "").trim()
  if (!s) return { html: escapeCell("—"), heightPt: 40 }
  const chunks = s
    .split(/,\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const lines: string[] = []
  const pushWrapped = (chunk: string) => {
    const words = chunk.split(/\s+/).filter(Boolean)
    let cur = ""
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (next.length > maxLen && cur) {
        lines.push(cur)
        cur = w
      } else {
        cur = next
      }
    }
    if (cur) lines.push(cur)
  }
  if (chunks.length > 1) chunks.forEach(pushWrapped)
  else pushWrapped(s)
  if (lines.length > MAX_ADDR_LINES) {
    const head = lines.slice(0, MAX_ADDR_LINES - 1)
    const tail = lines.slice(MAX_ADDR_LINES - 1).join(" ")
    lines.length = 0
    lines.push(...head, tail)
  }
  const html = (lines.length ? lines : [s]).map(escapeCell).join("<br/>")
  const n = Math.max(1, (html.match(/<br\/>/g) || []).length + 1)
  return { html, heightPt: Math.min(68, Math.max(40, n * 14 + 10)) }
}

function pairTextRow(
  leftLabel: string,
  leftVal: string,
  rightLabel: string,
  rightVal: string,
  heightPt: number
): string {
  const L = String(leftVal || "").trim() || "—"
  const R = String(rightVal || "").trim() || "—"
  return `<tr style="height:${heightPt}pt">
<td class="po-k">${escapeCell(leftLabel)}</td>
<td class="po-v po-text" colspan="2" x:str="${escapeCell(L)}">${escapeCell(L)}</td>
<td class="po-k">${escapeCell(rightLabel)}</td>
<td class="po-v po-text" colspan="2" x:str="${escapeCell(R)}">${escapeCell(R)}</td>
</tr>`
}

function moneyCell(n: number, extraClass = ""): string {
  const v = roundMoney2(n)
  const cls = extraClass ? `num po-money ${extraClass}` : "num po-money"
  return `<td class="${cls}">${v}</td>`
}

function qtyCell(n: number): string {
  return `<td class="num-int po-qty">${Number.isFinite(n) ? n : 0}</td>`
}

function groupLinesByStore(lines: PoExcelLine[]): Map<string, PoExcelLine[]> | null {
  const hasStore = lines.some((c) => c.store && String(c.store).trim())
  if (!hasStore) return null
  const byStore = new Map<string, PoExcelLine[]>()
  for (const c of lines) {
    const store = (c.store && String(c.store).trim()) || "-"
    const arr = byStore.get(store) || []
    arr.push(c)
    byStore.set(store, arr)
  }
  return byStore
}

function pairRow(leftLabel: string, leftHtml: string, rightLabel: string, rightHtml: string, heightPt: number): string {
  return `<tr style="height:${heightPt}pt">
<td class="po-k">${escapeCell(leftLabel)}</td>
<td class="po-v po-addr" colspan="2">${leftHtml}</td>
<td class="po-k">${escapeCell(rightLabel)}</td>
<td class="po-v po-addr" colspan="2">${rightHtml}</td>
</tr>`
}

function partyRows(from: PoExcelParty, billTo: PoExcelParty, labels: PoExcelLabels): string {
  const fromAddr = wrapAddressHtml(from.address || "")
  const toAddr = wrapAddressHtml(billTo.address || "")
  const extras = Math.max(from.extraLines?.length || 0, billTo.extraLines?.length || 0)
  const extraRows: string[] = []
  for (let i = 0; i < extras; i++) {
    const L = from.extraLines?.[i]
    const R = billTo.extraLines?.[i]
    extraRows.push(
      pairRow(
        L?.label || "",
        L ? wrapAddressHtml(L.value).html : "&nbsp;",
        R?.label || "",
        R ? wrapAddressHtml(R.value).html : "&nbsp;",
        28
      )
    )
  }
  return `${pairRow(labels.fromLabel, `<b>${escapeCell(from.name || "—")}</b>`, labels.billToLabel, `<b>${escapeCell(billTo.name || "—")}</b>`, 28)}
${pairRow(labels.addressLabel, fromAddr.html, labels.addressLabel, toAddr.html, Math.max(fromAddr.heightPt, toAddr.heightPt))}
${pairTextRow(labels.taxIdLabel, from.taxId || "—", labels.taxIdLabel, billTo.taxId || "—", 22)}
${pairTextRow(labels.phoneLabel, from.phone || "—", labels.phoneLabel, billTo.phone || "—", 22)}
${extraRows.join("")}`
}

function poExcelCss(): string {
  return `${erpExcelRichTableCss()}
@page { size: A4 portrait; margin: 10mm; mso-page-orientation: portrait; mso-header-margin: 6mm; mso-footer-margin: 6mm; }
body { margin: 0; padding: 0; }
table.xl.po-sheet { width: ${SHEET_WIDTH_MM}mm; max-width: ${SHEET_WIDTH_MM}mm; table-layout: fixed; border-collapse: collapse; }
table.xl.po-sheet td, table.xl.po-sheet th { white-space: normal; word-wrap: break-word; overflow-wrap: anywhere; font-size: 11pt; padding: 6px 8px; }
.po-band { background: #1e4d8c; color: #ffffff; font-size: 22pt; font-weight: 700; padding: 14px 12px; border-color: #1e4d8c; height: 44pt; }
.po-band-meta { background: #1e4d8c; color: #ffffff; font-size: 11pt; text-align: right; vertical-align: middle; padding: 12px 12px; border-color: #1e4d8c; line-height: 1.45; }
.po-band-meta b { font-size: 14pt; }
.po-badge { background: #e8eef6; color: #1e4d8c; font-size: 11pt; font-weight: 700; padding: 7px 10px; border-color: #c5d4e8; }
.po-format { background: #f8fafc; color: #334155; font-size: 10pt; padding: 6px 10px; border-color: #e2e8f0; }
.po-k { background: #e8eef6; font-weight: 700; color: #1e4d8c; font-size: 10pt; width: 72px; }
.po-v { background: #ffffff; color: #0f172a; }
.po-text { mso-number-format: "\\@"; }
.po-addr { white-space: normal; line-height: 1.45; font-size: 11pt; mso-number-format: "\\@"; }
.po-wrap { white-space: normal; word-wrap: break-word; }
.po-ship-k { background: #e8eef6; color: #1e4d8c; font-weight: 700; font-size: 11pt; }
.po-ship-v { background: #ffffff; font-size: 11pt; }
.po-thead th { background: #1e4d8c; color: #ffffff; font-weight: 700; font-size: 11pt; border-color: #163a6b; padding: 8px 6px; }
.po-store td { background: #e8eef6; font-weight: 700; color: #1e4d8c; }
.xl-body td { font-size: 11pt; }
.po-blank td { border-color: #e2e8f0; }
.po-money { mso-number-format: "\\#\\,\\#\\#0\\.00"; text-align: right; white-space: nowrap; }
.po-qty { text-align: center; }
.po-total-lbl { text-align: right; font-weight: 700; color: #334155; background: #f8fafc; font-size: 11pt; }
.po-total-val { background: #f8fafc; font-weight: 700; }
.po-grand-lbl { text-align: right; font-weight: 700; color: #ffffff; background: #1e4d8c; border-color: #1e4d8c; font-size: 12pt; }
.po-grand-val { font-weight: 700; color: #ffffff; background: #1e4d8c; border-color: #1e4d8c; font-size: 12pt; }
.po-wht-lbl { text-align: right; color: #9f1239; background: #fff1f2; }
.po-wht-val { color: #9f1239; background: #fff1f2; font-weight: 600; }
.po-net-lbl { text-align: right; font-weight: 700; background: #f1f5f9; }
.po-net-val { font-weight: 700; background: #f1f5f9; }
.po-sign { vertical-align: top; }
.po-sign-hint { font-size: 11pt; color: #334155; }
.po-gap td { height: ${SECTION_GAP_PT}pt; border: none !important; padding: 0 !important; background: transparent !important; }
.po-foot { font-size: 8pt; color: #64748b; border: none !important; padding: 4px 2px 0 2px !important; }
`
}

function excelPrintAreaFormula(sheet: string, lastRow: number): string {
  const q = `'${sheet.replace(/'/g, "''")}'`
  return `=${q}!$A$1:$F$${Math.max(1, lastRow)}`
}

function excelShell(inner: string, title: string, lastRow: number): string {
  const sheet = xmlEscapeText(excelSheetName(title))
  const printArea = xmlEscapeText(excelPrintAreaFormula(sheet, lastRow))
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/>
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook>
 <x:ExcelWorksheets>
  <x:ExcelWorksheet>
   <x:Name>${sheet}</x:Name>
   <x:WorksheetOptions>
    <x:StandardWidth>2</x:StandardWidth>
    <x:Print>
     <x:ValidPrinterInfo/>
     <x:PaperSizeIndex>9</x:PaperSizeIndex>
     <x:Scale>100</x:Scale>
    </x:Print>
    <x:PageSetup>
     <x:Layout x:Orientation="Portrait"/>
     <x:Header x:Margin="0.25"/>
     <x:Footer x:Margin="0.25"/>
     <x:PageMargins x:Bottom="0.4" x:Left="0.4" x:Right="0.4" x:Top="0.4"/>
    </x:PageSetup>
    <x:DoNotDisplayGridlines/>
   </x:WorksheetOptions>
  </x:ExcelWorksheet>
 </x:ExcelWorksheets>
 <x:ExcelName>
  <x:Name>Print_Area</x:Name>
  <x:SheetIndex>1</x:SheetIndex>
  <x:Formula>${printArea}</x:Formula>
 </x:ExcelName>
</x:ExcelWorkbook>
</xml><![endif]-->
<style>${poExcelCss()}</style>
</head>
<body>
${inner}
</body>
</html>`
}

function blankItemRow(): string {
  return `<tr class="xl-body po-blank" style="height:${ITEM_ROW_HEIGHT_PT}pt">
<td class="po-qty">&nbsp;</td>
<td>&nbsp;</td>
<td>&nbsp;</td>
<td class="po-money">&nbsp;</td>
<td class="po-qty">&nbsp;</td>
<td class="po-money">&nbsp;</td>
</tr>`
}

function padItemRows(html: string, usedRows: number): string {
  const need = Math.max(0, PO_EXCEL_MIN_ITEM_ROWS - usedRows)
  return html + Array.from({ length: need }, () => blankItemRow()).join("")
}

function lineRowsHtml(lines: PoExcelLine[], storeLabel: string): string {
  const renderItem = (c: PoExcelLine, i: number) => {
    const spec = String(c.spec || c.code || "").trim() || "-"
    const amount = roundMoney2((Number(c.price) || 0) * (Number(c.qty) || 0))
    return `<tr class="xl-body" style="height:${ITEM_ROW_HEIGHT_PT}pt">
<td class="num-int po-qty">${i + 1}</td>
<td class="po-wrap">${escapeCell(c.name || "—")}</td>
<td class="po-wrap">${escapeCell(spec)}</td>
${moneyCell(Number(c.price) || 0)}
${qtyCell(Number(c.qty) || 0)}
${moneyCell(amount)}
</tr>`
  }
  const grouped = groupLinesByStore(lines)
  if (!grouped) {
    return padItemRows(lines.map((c, i) => renderItem(c, i)).join(""), lines.length)
  }
  const parts: string[] = []
  let used = 0
  for (const [storeName, items] of grouped.entries()) {
    parts.push(
      `<tr class="po-store" style="height:${ITEM_ROW_HEIGHT_PT}pt"><td colspan="${COLS}">${escapeCell(storeLabel)}: ${escapeCell(storeName)}</td></tr>`
    )
    used += 1
    items.forEach((c, i) => {
      parts.push(renderItem(c, i))
      used += 1
    })
  }
  return padItemRows(parts.join(""), used)
}

function gapRow(): string {
  return `<tr class="po-gap"><td colspan="${COLS}" style="height:${SECTION_GAP_PT}pt">&nbsp;</td></tr>`
}

export function buildPurchaseOrderExcelHtml(input: PoExcelInput): string {
  const { labels } = input
  const wht = Math.abs(Number(input.withholdingTaxAmount) || 0)
  const netAfterWht = roundMoney2(Math.max(0, roundMoney2(input.total) - wht))
  const badge = String(labels.headerBadge || "").trim()
  const formatLabel = String(labels.poFormatLabel || "").trim()

  const header = `<tr>
<td class="po-band" colspan="4">${escapeCell(labels.docTitle)}</td>
<td class="po-band-meta" colspan="2">${escapeCell(labels.docNoLabel)}<br/><b>${escapeCell(input.poNo)}</b><br/>${escapeCell(labels.dateLabel)}: ${escapeCell(input.dateStr)}</td>
</tr>
${badge ? `<tr><td class="po-badge" colspan="${COLS}">${escapeCell(badge)}</td></tr>` : ""}
${formatLabel ? `<tr><td class="po-format" colspan="${COLS}">${escapeCell(formatLabel)}</td></tr>` : ""}`

  const shipAddr = wrapAddressHtml(input.shipToAddress || "", 72)
  const ship = `<tr style="height:${shipAddr.heightPt + 16}pt">
<td class="po-ship-k">${escapeCell(labels.shipToLabel)}</td>
<td class="po-ship-v po-addr" colspan="5"><b>${escapeCell(input.shipToName || "—")}</b>${
    input.shipToAddress ? `<br/>${shipAddr.html}` : ""
  }</td>
</tr>`

  const thead = `<tr class="po-thead">
<th class="num-int">${escapeCell(labels.no)}</th>
<th>${escapeCell(labels.item)}</th>
<th>${escapeCell(labels.spec)}</th>
<th class="num">${escapeCell(labels.unitPrice)}</th>
<th class="num-int">${escapeCell(labels.qty)}</th>
<th class="num">${escapeCell(labels.amount)}</th>
</tr>`

  const totals = `<tr>
<td colspan="4" style="border:none;background:transparent"></td>
<td class="po-total-lbl">${escapeCell(labels.subtotal)}</td>
${moneyCell(input.subtotal, "po-total-val")}
</tr>
<tr>
<td colspan="4" style="border:none;background:transparent"></td>
<td class="po-total-lbl">${escapeCell(labels.vatLine)}</td>
${moneyCell(input.vat, "po-total-val")}
</tr>
<tr>
<td colspan="4" style="border:none;background:transparent"></td>
<td class="po-grand-lbl">${escapeCell(labels.invoiceTotal)}</td>
${moneyCell(input.total, "po-grand-val")}
</tr>${
    wht > 0 && labels.whtLabel
      ? `
<tr>
<td colspan="4" style="border:none;background:transparent"></td>
<td class="po-wht-lbl">${escapeCell(labels.whtLabel)}</td>
${moneyCell(-wht, "po-wht-val")}
</tr>
<tr>
<td colspan="4" style="border:none;background:transparent"></td>
<td class="po-net-lbl">${escapeCell(labels.netAfterWht || "")}</td>
${moneyCell(netAfterWht, "po-net-val")}
</tr>`
      : ""
  }`

  const sign = `<tr class="po-sign" style="height:${SIGN_BOX_HEIGHT_PT}pt">
<td class="po-v po-sign-hint" colspan="3"><b>${escapeCell(input.billTo.name || "—")}</b><br/><br/>${escapeCell(labels.receivedBy)}<br/>________________________<br/><br/>${escapeCell(labels.signatureDate)}<br/>________________________</td>
<td class="po-v po-sign-hint" colspan="3"><b>${escapeCell(input.from.name || "—")}</b><br/><br/>${escapeCell(labels.authorizedStamp)}<br/>________________________<br/><br/>${escapeCell(labels.preparedBy)}: ${escapeCell(input.preparedByName || "—")}</td>
</tr>`

  const colgroup = `<colgroup>${COL_WIDTH_PX.map(
    (px, i) => `<col width="${px}" style="width:${COL_WIDTH_PT[i]}pt"/>`
  ).join("")}</colgroup>`

  const table = `<table class="xl po-sheet" role="table" border="0" cellspacing="0" cellpadding="0" width="${SHEET_WIDTH_PX}" style="width:${SHEET_WIDTH_MM}mm">
${colgroup}
${header}
${gapRow()}
${partyRows(input.from, input.billTo, labels)}
${gapRow()}
${ship}
${gapRow()}
${thead}
${lineRowsHtml(input.lines, labels.storeLabel)}
${gapRow()}
${totals}
${gapRow()}
${sign}
<tr><td class="po-foot" colspan="${COLS}">A4</td></tr>
</table>`

  const lastRow = (table.match(/<tr\b/gi) || []).length
  return excelShell(table, labels.docTitle || input.poNo, lastRow)
}
