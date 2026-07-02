import * as XLSX from 'xlsx'
import { writeErpXlsxWorkbook } from '@/lib/erp-excel-export'

export type IncomeStatementXlsxRow = {
  label: string
  amount: number | null
  pct: string
}

export async function downloadIncomeStatementXlsx(
  filename: string,
  headerLines: string[],
  colLabels: [string, string, string],
  rows: IncomeStatementXlsxRow[]
): Promise<void> {
  const aoa: (string | number)[][] = headerLines.map((line) => [line])
  aoa.push([])
  aoa.push([colLabels[0], colLabels[1], colLabels[2]])
  for (const r of rows) {
    aoa.push([r.label, r.amount ?? '', r.pct])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'P&L')
  await writeErpXlsxWorkbook(wb, filename)
}

export function sanitizeFilenamePart(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 80) || 'report'
}
