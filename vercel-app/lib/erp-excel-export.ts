/**
 * ERP 자료 다운로드(Excel HTML·.xlsx) 공통 글꼴·헬퍼.
 * 물류·회계·급여 등 표 다운로드 기본 본문 = 10pt.
 */

import { utils, type WorkBook, type WorkSheet } from "xlsx"

/** ERP 다운로드 표 본문 기본 글꼴(포인트) */
export const ERP_DOWNLOAD_FONT_SIZE_PT = 10

const ERP_DOWNLOAD_FONT_FAMILY =
  'Calibri, "Malgun Gothic", "Noto Sans KR", "Noto Sans Thai", Arial, sans-serif'

export type ErpExcelSimpleTableStyleOptions = {
  /** th 셀 포함(은행·미수채무 등) */
  includeTh?: boolean
  /** .head 행 */
  withHead?: boolean
  /** .total 합계 행 */
  withTotal?: boolean
  /** 테두리 색 — 기본 #ccc */
  borderColor?: string
  /** table { width:100% } */
  fullWidth?: boolean
}

/** 단순 표(.xls HTML)용 인라인 CSS */
export function erpExcelSimpleTableStyle(opts: ErpExcelSimpleTableStyleOptions = {}): string {
  const fs = `${ERP_DOWNLOAD_FONT_SIZE_PT}pt`
  const border = opts.borderColor ?? "#ccc"
  const cells = opts.includeTh ? "td,th" : "td"
  const parts = [
    `${cells}{border:1px solid ${border};padding:4px 8px;font-size:${fs}}`,
    opts.includeTh ? "th{font-weight:bold;background:#e8e8e8}" : "",
    opts.withHead ? ".head{font-weight:bold;background:#f0f0f0}" : "",
    opts.withTotal ? ".total{font-weight:bold;background:#e8f4ff}" : "",
    `table{${opts.fullWidth !== false ? "width:100%;" : ""}border-collapse:collapse}`,
  ]
  return parts.filter(Boolean).join("")
}

/** 입고·세금계산서 등 서식 있는 Excel HTML 표 CSS */
export function erpExcelRichTableCss(): string {
  const fs = `${ERP_DOWNLOAD_FONT_SIZE_PT}pt`
  return `
table.xl { border-collapse: collapse; width: 100%; font-family: ${ERP_DOWNLOAD_FONT_FAMILY}; font-size: ${fs}; color: #0f172a; }
table.xl td, table.xl th { border: 1px solid #94a3b8; padding: 6px 10px; vertical-align: middle; }
table.xl td.num, table.xl th.num { text-align: right; mso-number-format: "\\#\\,\\#\\#0\\.000\\ "; }
table.xl td.num-int, table.xl th.num-int { text-align: right; mso-number-format: "0"; }
.xl-band { background: #0f2744; color: #ffffff; font-size: 15pt; font-weight: 700; padding: 10px 14px; border-color: #0f2744; letter-spacing: -0.02em; }
.xl-band-sub { background: #e2e8f0; color: #1e293b; font-size: ${fs}; font-weight: 600; padding: 8px 14px; border-color: #cbd5e1; }
.xl-spacer { border: none !important; height: 10px; padding: 0 !important; background: transparent !important; }
.xl-meta-k { background: #f1f5f9; font-weight: 600; color: #475569; width: 140px; border-color: #cbd5e1; font-size: ${fs}; }
.xl-meta-v { background: #ffffff; color: #0f172a; border-color: #cbd5e1; font-size: ${fs}; }
.xl-thead th { background: #1e293b; color: #ffffff; font-weight: 700; font-size: ${fs}; border-color: #334155; }
.xl-body td { border-color: #e2e8f0; font-size: ${fs}; }
.xl-body tr:nth-child(even) td { background: #fafbfc; }
.xl-tfoot td { background: #f1f5f9; font-weight: 700; border-top: 2px solid #0f2744 !important; border-color: #94a3b8; font-size: ${fs}; }
.xl-tfoot-lbl { text-align: right; color: #334155; }
.xl-section { background: #ffffff; font-size: ${fs}; font-weight: 700; color: #0f2744; padding: 10px 12px; border-left: 4px solid #0f2744; border-bottom: 1px solid #cbd5e1; }
.xl-foot { font-size: 9pt; color: #64748b; padding: 10px 4px 4px 4px; border: none !important; }
`
}

export function buildErpExcelHtmlDocument(body: string, styleCss: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>${styleCss}</style></head>
<body>
${body}
</body>
</html>`
}

export function erpExcelHtmlBlob(html: string): Blob {
  return new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
}

export function triggerErpExcelHtmlDownload(html: string, filename: string): void {
  const blob = erpExcelHtmlBlob(html)
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}


export function applyErpDownloadFontToWorksheet(ws: WorkSheet): void {
  const ref = ws["!ref"]
  if (!ref) return
  const range = utils.decode_range(ref)
  const font = { name: "Calibri", sz: ERP_DOWNLOAD_FONT_SIZE_PT, color: { rgb: "FF000000" } }
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = utils.encode_cell({ r, c })
      const cell = ws[addr] as { s?: Record<string, unknown> } | undefined
      if (!cell) continue
      const prev = (cell.s ?? {}) as Record<string, unknown>
      cell.s = { ...prev, font: { ...(prev.font as object | undefined), ...font } }
    }
  }
}

export function applyErpDownloadFontToWorkbook(wb: WorkBook): void {
  for (const name of wb.SheetNames) {
    applyErpDownloadFontToWorksheet(wb.Sheets[name])
  }
}

/** .xlsx 저장 — 모든 시트에 10pt 기본 글꼴 적용 */
export async function writeErpXlsxWorkbook(wb: WorkBook, filename: string): Promise<void> {
  applyErpDownloadFontToWorkbook(wb)
  const XLSX = await import("xlsx-js-style")
  XLSX.writeFile(wb, filename)
}

/** API 응답용 .xlsx Buffer */
export async function writeErpXlsxWorkbookToBuffer(wb: WorkBook): Promise<Buffer> {
  applyErpDownloadFontToWorkbook(wb)
  const XLSX = await import("xlsx-js-style")
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}
