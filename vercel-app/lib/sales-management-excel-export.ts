/** 매출 관리 조회 결과 → Excel(.xlsx) 다운로드 */

export type SalesExcelSheet = {
  name: string
  headers: string[]
  rows: (string | number)[][]
}

function sanitizeSheetName(name: string): string {
  const s = String(name || 'Sheet')
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31)
  return s || 'Sheet'
}

export async function downloadSalesManagementXlsx(filename: string, sheets: SalesExcelSheet[]) {
  if (!sheets.length) return
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const aoa = [sheet.headers, ...sheet.rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name))
  }
  XLSX.writeFile(wb, filename)
}
