import * as XLSX from 'xlsx'
import type { PosSalesHierarchyLevel, PosSalesHierarchyRow } from '@/lib/api-client'
import { sanitizeFilenamePart } from '@/lib/income-statement-export'

const LEVEL_ORDER: PosSalesHierarchyLevel[] = ['main', 'category', 'menu', 'option']

export function buildTotalSalesExportFilename(parts: {
  startStr: string
  endStr: string
  storePart: string
}): string {
  return `total-sales_${sanitizeFilenamePart(parts.startStr)}_${sanitizeFilenamePart(parts.endStr)}_${sanitizeFilenamePart(parts.storePart)}.xlsx`
}

export function downloadTotalSalesHierarchyXlsx(params: {
  filename: string
  metaRows: string[][]
  sheetNames: Record<PosSalesHierarchyLevel, string>
  col: {
    no: string
    name: string
    main: string
    category: string
    qty: string
    sales: string
  }
  levels: Record<PosSalesHierarchyLevel, PosSalesHierarchyRow[]>
}): void {
  const wb = XLSX.utils.book_new()

  for (const level of LEVEL_ORDER) {
    const rows = params.levels[level] ?? []
    const aoa: (string | number)[][] = [...params.metaRows, []]

    if (level === 'main') {
      aoa.push([params.col.no, params.col.name, params.col.qty, params.col.sales])
      rows.forEach((r, i) => {
        aoa.push([i + 1, r.label, r.qty, Math.round(r.sales)])
      })
    } else if (level === 'category') {
      aoa.push([params.col.no, params.col.name, params.col.main, params.col.qty, params.col.sales])
      rows.forEach((r, i) => {
        aoa.push([i + 1, r.label, r.categoryMain ?? '', r.qty, Math.round(r.sales)])
      })
    } else {
      aoa.push([
        params.col.no,
        params.col.name,
        params.col.main,
        params.col.category,
        params.col.qty,
        params.col.sales,
      ])
      rows.forEach((r, i) => {
        aoa.push([
          i + 1,
          r.label,
          r.categoryMain ?? '',
          r.category ?? '',
          r.qty,
          Math.round(r.sales),
        ])
      })
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 6 }, { wch: 36 }, { wch: 18 }, { wch: 22 }, { wch: 10 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws, params.sheetNames[level].slice(0, 31))
  }

  XLSX.writeFile(wb, params.filename)
}
