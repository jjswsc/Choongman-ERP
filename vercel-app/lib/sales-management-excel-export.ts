/** 매출 관리 조회 결과 → Excel(.xlsx) 다운로드 */

import type { WorkSheet } from 'xlsx'

export type SalesExcelColFormat = 'text' | 'integer' | 'money' | 'percent'

export type SalesExcelSheet = {
  name: string
  headers: string[]
  rows: (string | number)[][]
  /** 열 서식 — 생략 시 값·헤더 기준 자동 추론 */
  colFormats?: SalesExcelColFormat[]
}

/** 시트별 colFormats 지정용 */
export const salesExcelCol = {
  text: 'text' as const,
  int: 'integer' as const,
  money: 'money' as const,
  pct: 'percent' as const,
}

const NUM_FMT_MONEY = '#,##0.00'
const NUM_FMT_MONEY_INT = '#,##0'
const NUM_FMT_INT = '#,##0'
const NUM_FMT_PERCENT = '0.0%'

function sanitizeSheetName(name: string): string {
  const s = String(name || 'Sheet')
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31)
  return s || 'Sheet'
}

function isNumericCell(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function parsePercentValue(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v > 1 ? v / 100 : v
  }
  const s = String(v ?? '').trim()
  if (!s.endsWith('%')) return null
  const n = Number(s.slice(0, -1).trim())
  return Number.isFinite(n) ? n / 100 : null
}

function inferColFormats(headers: string[], rows: (string | number)[][]): SalesExcelColFormat[] {
  return headers.map((_, colIdx) => {
    const samples = rows
      .map((r) => r[colIdx])
      .filter((v) => v !== '' && v != null)

    if (samples.length === 0) return 'text'

    if (samples.every((v) => parsePercentValue(v) != null)) return 'percent'

    const textSamples = samples.filter((v) => typeof v === 'string' && Number.isNaN(Number(v)))
    if (textSamples.length > 0) return 'text'

    const nums = samples.map((v) => Number(v)).filter((n) => Number.isFinite(n))
    if (nums.length === 0) return 'text'

    const allInt = nums.every((n) => Math.abs(n - Math.round(n)) < 1e-9)
    if (allInt && colIdx > 0 && nums.every((n) => Math.abs(n) < 10_000)) return 'integer'

    return 'money'
  })
}

function calcColWidths(headers: string[], rows: (string | number)[][]): { wch: number }[] {
  const widths = headers.map((h) => Math.min(42, Math.max(10, String(h).length + 3)))
  for (const row of rows) {
    for (let c = 0; c < headers.length; c++) {
      const v = row[c]
      if (v === '' || v == null) continue
      let displayLen = String(v).length
      if (isNumericCell(v)) {
        const intPart = Math.trunc(Math.abs(v))
        const commaCount = Math.floor(String(intPart).length / 3)
        displayLen = String(v).length + commaCount + (Number.isInteger(v) ? 0 : 1)
      }
      widths[c] = Math.min(42, Math.max(widths[c] ?? 10, displayLen + 3))
    }
  }
  return widths.map((w) => ({ wch: w }))
}

function encodeCol(col: number): string {
  let s = ''
  let n = col + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function applyCellFormats(ws: WorkSheet, formats: SalesExcelColFormat[], rowCount: number): void {
  for (let r = 1; r < rowCount; r++) {
    for (let c = 0; c < formats.length; c++) {
      const fmt = formats[c]
      const addr = `${encodeCol(c)}${r + 1}`
      const cell = ws[addr]
      if (!cell || cell.v === '' || cell.v == null) continue

      if (fmt === 'text') {
        cell.t = 's'
        cell.v = String(cell.v)
        continue
      }

      if (fmt === 'percent') {
        const pct = parsePercentValue(cell.v)
        if (pct == null) continue
        cell.t = 'n'
        cell.v = pct
        cell.z = NUM_FMT_PERCENT
        continue
      }

      const n = Number(cell.v)
      if (!Number.isFinite(n)) continue
      cell.t = 'n'
      cell.v = n
      if (fmt === 'integer') {
        cell.v = Math.round(n)
        cell.z = NUM_FMT_INT
      } else if (fmt === 'money') {
        cell.z = Number.isInteger(n) ? NUM_FMT_MONEY_INT : NUM_FMT_MONEY
      }
    }
  }
}

function applySheetLayout(ws: WorkSheet, headers: string[], rows: (string | number)[][]): void {
  const rowCount = rows.length + 1
  const colCount = headers.length
  if (rowCount < 1 || colCount < 1) return

  ws['!cols'] = calcColWidths(headers, rows)

  const lastCol = encodeCol(colCount - 1)
  ws['!autofilter'] = { ref: `A1:${lastCol}${rowCount}` }
  ws['!freeze'] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: 'A2',
    activePane: 'bottomLeft',
    state: 'frozen',
  }
}

export async function downloadSalesManagementXlsx(filename: string, sheets: SalesExcelSheet[]) {
  if (!sheets.length) return
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const aoa = [sheet.headers, ...sheet.rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const formats = sheet.colFormats ?? inferColFormats(sheet.headers, sheet.rows)
    applyCellFormats(ws, formats, aoa.length)
    applySheetLayout(ws, sheet.headers, sheet.rows)
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name))
  }
  XLSX.writeFile(wb, filename)
}
