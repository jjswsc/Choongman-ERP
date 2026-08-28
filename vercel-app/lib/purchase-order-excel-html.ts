/**
 * 회계·물류 PO Excel(.xls HTML) — A4 세로 바로 인쇄용 인보이스 양식.
 * 화면 인쇄(`/admin/po-print`)와 같은 당사자·금액 구조를 표로 옮긴다.
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
/** 품목이 적어도 A4 본문을 채울 빈 줄 수 (실제 줄이 이보다 많으면 추가하지 않음) */
export const PO_EXCEL_MIN_ITEM_ROWS = 14
const ITEM_ROW_HEIGHT_PT = 26
const SIGN_BOX_HEIGHT_PT = 96
const SECTION_GAP_PT = 14

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

function partyInnerTable(party: PoExcelParty, sectionLabel: string, labels: PoExcelLabels): string {
  const extras = (party.extraLines || [])
    .filter((x) => String(x.value || "").trim())
    .map(
      (x) =>
        `<tr><td class="po-k" style="height:22pt">${escapeCell(x.label)}</td><td class="po-v po-wrap">${escapeCell(x.value)}</td></tr>`
    )
    .join("")
  return `<table class="po-inner">
<tr><td class="po-section" colspan="2" style="height:22pt">${escapeCell(sectionLabel)}</td></tr>
<tr><td class="po-party-name" colspan="2" style="height:28pt">${escapeCell(party.name || "—")}</td></tr>
<tr><td class="po-k" style="height:36pt">${escapeCell(labels.addressLabel)}</td><td class="po-v po-wrap">${escapeCell(party.address || "—")}</td></tr>
<tr><td class="po-k" style="height:22pt">${escapeCell(labels.taxIdLabel)}</td><td class="po-v">${escapeCell(party.taxId || "—")}</td></tr>
<tr><td class="po-k" style="height:22pt">${escapeCell(labels.phoneLabel)}</td><td class="po-v">${escapeCell(party.phone || "—")}</td></tr>
${extras}
</table>`
}

function poExcelCss(): string {
  return `${erpExcelRichTableCss()}
@page { size: A4 portrait; margin: 10mm; mso-page-orientation: portrait; mso-header-margin: 6mm; mso-footer-margin: 6mm; }
body { margin: 0; padding: 0; }
table.xl.po-sheet { width: 100%; table-layout: fixed; border-collapse: collapse; }
table.xl.po-sheet td, table.xl.po-sheet th { white-space: normal; word-wrap: break-word; overflow-wrap: anywhere; font-size: 12pt; padding: 8px 10px; }
.po-band { background: #1e4d8c; color: #ffffff; font-size: 22pt; font-weight: 700; padding: 18px 16px; border-color: #1e4d8c; letter-spacing: -0.02em; height: 48pt; }
.po-band-meta { background: #1e4d8c; color: #ffffff; font-size: 12pt; text-align: right; vertical-align: middle; padding: 14px 16px; border-color: #1e4d8c; line-height: 1.5; }
.po-band-meta b { font-size: 14pt; }
.po-badge { background: #e8eef6; color: #1e4d8c; font-size: 11pt; font-weight: 700; padding: 8px 12px; border-color: #c5d4e8; height: 22pt; }
.po-format { background: #f8fafc; color: #334155; font-size: 11pt; padding: 8px 12px; border-color: #e2e8f0; }
td.po-party { vertical-align: top; width: 50%; padding: 0 !important; border: none !important; }
table.po-inner { width: 100%; border-collapse: collapse; font-family: inherit; font-size: 12pt; }
table.po-inner td { border: 1px solid #c5d4e8; padding: 8px 10px; vertical-align: top; font-size: 12pt; }
.po-section { background: #e8eef6; color: #1e4d8c; font-weight: 700; font-size: 12pt; letter-spacing: 0.04em; }
.po-party-name { font-weight: 700; font-size: 14pt; color: #0f172a; background: #ffffff; }
.po-k { background: #f8fafc; font-weight: 600; color: #475569; width: 96px; font-size: 11pt; }
.po-v { background: #ffffff; color: #0f172a; }
.po-wrap { white-space: normal; word-wrap: break-word; }
.po-ship-k { background: #e8eef6; color: #1e4d8c; font-weight: 700; width: 18%; font-size: 12pt; }
.po-ship-v { background: #ffffff; font-size: 12pt; }
.po-thead th { background: #1e4d8c; color: #ffffff; font-weight: 700; font-size: 12pt; border-color: #163a6b; padding: 10px 8px; height: 24pt; }
.po-store td { background: #e8eef6; font-weight: 700; color: #1e4d8c; height: ${ITEM_ROW_HEIGHT_PT}pt; }
.xl-body td { font-size: 12pt; height: ${ITEM_ROW_HEIGHT_PT}pt; }
.po-blank td { height: ${ITEM_ROW_HEIGHT_PT}pt; border-color: #e2e8f0; }
.po-money { mso-number-format: "\\#\\,\\#\\#0\\.00"; text-align: right; white-space: nowrap; }
.po-qty { text-align: center; }
.po-total-lbl { text-align: right; font-weight: 600; color: #334155; background: #f8fafc; font-size: 12pt; height: 22pt; }
.po-total-val { background: #f8fafc; font-weight: 600; font-size: 12pt; }
.po-grand-lbl { text-align: right; font-weight: 700; color: #ffffff; background: #1e4d8c; border-color: #1e4d8c; font-size: 13pt; height: 26pt; }
.po-grand-val { font-weight: 700; color: #ffffff; background: #1e4d8c; border-color: #1e4d8c; font-size: 13pt; }
.po-wht-lbl { text-align: right; color: #9f1239; background: #fff1f2; font-size: 12pt; height: 22pt; }
.po-wht-val { color: #9f1239; background: #fff1f2; font-weight: 600; }
.po-net-lbl { text-align: right; font-weight: 700; background: #f1f5f9; font-size: 12pt; height: 24pt; }
.po-net-val { font-weight: 700; background: #f1f5f9; }
.po-sign td { vertical-align: top; padding: 6px !important; }
.po-sign-hint { font-size: 11pt; color: #334155; line-height: 1.55; }
.po-gap td { height: ${SECTION_GAP_PT}pt; border: none !important; padding: 0 !important; background: transparent !important; }
.po-foot { font-size: 8pt; color: #64748b; border: none !important; padding: 6px 4px 0 4px !important; }
`
}

function excelShell(inner: string, title: string): string {
  const sheet = xmlEscapeText(excelSheetName(title))
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/>
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook>
 <x:ExcelWorksheets>
  <x:ExcelWorksheet>
   <x:Name>${sheet}</x:Name>
   <x:WorksheetOptions>
    <x:FitToPage/>
    <x:Print>
     <x:ValidPrinterInfo/>
     <x:PaperSizeIndex>9</x:PaperSizeIndex>
     <x:FitWidth>1</x:FitWidth>
     <x:FitHeight>0</x:FitHeight>
    </x:Print>
    <x:PageSetup>
     <x:Layout x:Orientation="Portrait"/>
     <x:Header x:Margin="0.3"/>
     <x:Footer x:Margin="0.3"/>
     <x:PageMargins x:Bottom="0.4" x:Left="0.45" x:Right="0.45" x:Top="0.4"/>
    </x:PageSetup>
    <x:DoNotDisplayGridlines/>
   </x:WorksheetOptions>
  </x:ExcelWorksheet>
 </x:ExcelWorksheets>
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

  const parties = `<tr>
<td class="po-party" colspan="3">${partyInnerTable(input.from, labels.fromLabel, labels)}</td>
<td class="po-party" colspan="3">${partyInnerTable(input.billTo, labels.billToLabel, labels)}</td>
</tr>`

  const ship = `<tr style="height:36pt">
<td class="po-ship-k">${escapeCell(labels.shipToLabel)}</td>
<td class="po-ship-v po-wrap" colspan="5"><b>${escapeCell(input.shipToName || "—")}</b>${
    input.shipToAddress ? `<br/>${escapeCell(input.shipToAddress)}` : ""
  }</td>
</tr>`

  const thead = `<tr class="po-thead">
<th class="num-int" style="width:8%">${escapeCell(labels.no)}</th>
<th style="width:40%">${escapeCell(labels.item)}</th>
<th style="width:14%">${escapeCell(labels.spec)}</th>
<th class="num" style="width:14%">${escapeCell(labels.unitPrice)}</th>
<th class="num-int" style="width:10%">${escapeCell(labels.qty)}</th>
<th class="num" style="width:14%">${escapeCell(labels.amount)}</th>
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

  const sign = `<tr class="po-sign">
<td colspan="3" class="po-sign">
<table class="po-inner">
<tr><td class="po-section" style="height:22pt">${escapeCell(input.billTo.name || "—")}</td></tr>
<tr><td class="po-v po-sign-hint" style="height:${SIGN_BOX_HEIGHT_PT}pt">${escapeCell(labels.receivedBy)}<br/><br/>______________________________<br/><br/><br/>${escapeCell(labels.signatureDate)}<br/><br/>______________________________</td></tr>
</table>
</td>
<td colspan="3" class="po-sign">
<table class="po-inner">
<tr><td class="po-section" style="height:22pt">${escapeCell(input.from.name || "—")}</td></tr>
<tr><td class="po-v po-sign-hint" style="height:${SIGN_BOX_HEIGHT_PT}pt">${escapeCell(labels.authorizedStamp)}<br/><br/>______________________________<br/><br/><br/>${escapeCell(labels.preparedBy)}: ${escapeCell(input.preparedByName || "—")}</td></tr>
</table>
</td>
</tr>`

  const table = `<table class="xl po-sheet" role="table">
<colgroup>
<col style="width:8%"/><col style="width:40%"/><col style="width:14%"/>
<col style="width:14%"/><col style="width:10%"/><col style="width:14%"/>
</colgroup>
${header}
${gapRow()}
${parties}
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

  return excelShell(table, labels.docTitle || input.poNo)
}
